//! Tauri commands for semantic search

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::db::ClipboardItem;
use crate::logger;

use super::SemanticState;
use super::SemanticStatus;

/// Search result with item and similarity score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSearchResult {
    pub item: ClipboardItem,
    pub score: f32,
}

/// Manual download info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualDownloadInfo {
    pub url: String,
    pub target_path: String,
    pub filename: String,
}

/// Get semantic search status
#[tauri::command]
pub async fn get_semantic_status(
    state: tauri::State<'_, SemanticState>,
) -> Result<SemanticStatus, String> {
    let mut status = state.status.read().map_err(|e| e.to_string())?.clone();

    // Check if model file exists (handles manual download)
    if !status.model_downloaded {
        if let Ok(exists) = super::model::check_model_file() {
            if exists {
                status.model_downloaded = true;
                // Update the stored status
                if let Ok(mut stored_status) = state.status.write() {
                    stored_status.model_downloaded = true;
                }
            }
        }
    }

    Ok(status)
}

/// Download the semantic model
#[tauri::command]
pub async fn download_model(app: tauri::AppHandle) -> Result<(), String> {
    super::model::download_model(app)
}

/// Cancel model download
#[tauri::command]
pub async fn cancel_model_download() -> Result<(), String> {
    super::model::cancel_download();
    Ok(())
}

/// Get manual download info (URL and target path)
#[tauri::command]
pub async fn get_manual_download_info() -> Result<ManualDownloadInfo, String> {
    let path = super::model::model_path();
    Ok(ManualDownloadInfo {
        url: super::model::get_model_url().to_string(),
        target_path: path.to_string_lossy().to_string(),
        filename: crate::config::SEMANTIC_MODEL_FILENAME.to_string(),
    })
}

/// Perform semantic search
#[tauri::command]
pub async fn semantic_search(
    app: tauri::AppHandle,
    query: String,
    limit: usize,
) -> Result<Vec<SemanticSearchResult>, String> {
    let state = app.state::<SemanticState>();

    // Check if semantic search is enabled and model is available
    {
        let status = state.status.read().map_err(|e| e.to_string())?;
        if !status.enabled {
            return Err("Semantic search is not enabled".to_string());
        }
        if !status.model_downloaded {
            return Err("Model not downloaded".to_string());
        }
    }

    // Ensure model is loaded
    super::model::ensure_model_loaded(&state)?;

    // Compute query embedding
    let query_embedding = super::embedding::compute_embedding(&state, &query)?;

    // Search in memory index
    let search_results = {
        let index = state.index.read().map_err(|e| e.to_string())?;
        index.search(&query_embedding, limit)
    };

    if search_results.is_empty() {
        return Ok(Vec::new());
    }

    // Fetch full items from database
    let db_state = app.state::<crate::DatabaseState>();
    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;

    let mut results = Vec::with_capacity(search_results.len());

    for sr in search_results {
        let item_result: Result<ClipboardItem, _> = conn.query_row(
            "SELECT id, type, content, hash, created_at FROM history WHERE id = ?1",
            [sr.item_id],
            |row| Ok(ClipboardItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                content: row.get(2)?,
                hash: row.get(3)?,
                created_at: row.get(4)?,
            }),
        );

        match item_result {
            Ok(item) => {
                results.push(SemanticSearchResult {
                    item,
                    score: sr.score,
                });
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                // Item was deleted, remove from index
                logger::warning("Semantic", &format!("Item {} not found in database", sr.item_id));
                if let Ok(mut index) = state.index.write() {
                    index.remove(sr.item_id);
                }
            }
            Err(e) => {
                logger::error("Semantic", &format!("Failed to fetch item {}: {}", sr.item_id, e));
            }
        }
    }

    logger::debug("Semantic", &format!("Search returned {} results", results.len()));
    Ok(results)
}

/// Toggle semantic search enabled state
#[tauri::command]
pub async fn set_semantic_enabled(
    state: tauri::State<'_, SemanticState>,
    enabled: bool,
) -> Result<(), String> {
    let mut status = state.status.write().map_err(|e| e.to_string())?;
    status.enabled = enabled;
    logger::info("Semantic", &format!("Semantic search {}", if enabled { "enabled" } else { "disabled" }));
    Ok(())
}

/// Rebuild the in-memory index from database
#[tauri::command]
pub async fn rebuild_semantic_index(app: tauri::AppHandle) -> Result<usize, String> {
    let state = app.state::<SemanticState>();
    let db_state = app.state::<crate::DatabaseState>();

    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;

    // Clear existing index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.clear();
    }

    // Load embeddings from database
    let count = {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        super::db::load_embeddings_into_index(&conn, &mut index).map_err(|e| e.to_string())?
    };

    // Update status
    {
        let mut status = state.status.write().map_err(|e| e.to_string())?;
        status.indexed_count = count;
    }

    logger::info("Semantic", &format!("Rebuilt index with {} embeddings", count));
    Ok(count)
}

/// Start bulk indexing for all items without embeddings
#[tauri::command]
pub async fn start_bulk_indexing(app: tauri::AppHandle) -> Result<(), String> {
    super::embedding::index_all_items(app);
    Ok(())
}

/// Fully rebuild the semantic index (clear all embeddings and re-index everything)
/// Use when embedding dimension changes or to fix corrupted embeddings
#[tauri::command]
pub async fn full_rebuild_index(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<SemanticState>();
    let db_state = app.state::<crate::DatabaseState>();

    // Clear in-memory index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.clear();
    }

    // Clear database embeddings
    let cleared_count = {
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        super::db::clear_all_embeddings(&conn).map_err(|e| e.to_string())?
    };

    // Reset status
    {
        let mut status = state.status.write().map_err(|e| e.to_string())?;
        status.indexed_count = 0;
    }

    logger::info("Semantic", &format!("Full rebuild: cleared {} embeddings", cleared_count));

    // Start re-indexing
    super::embedding::index_all_items(app);

    Ok(format!("Cleared {} embeddings, re-indexing started", cleared_count))
}
