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

/// Get semantic search status
#[tauri::command]
pub async fn get_semantic_status(
    state: tauri::State<'_, SemanticState>,
) -> Result<SemanticStatus, String> {
    let status = state.status.read().map_err(|e| e.to_string())?.clone();
    Ok(status)
}

/// Perform semantic search
#[tauri::command]
pub async fn semantic_search(
    app: tauri::AppHandle,
    query: String,
    limit: usize,
    min_score: Option<f32>,
) -> Result<Vec<SemanticSearchResult>, String> {
    let state = app.state::<SemanticState>();

    {
        let status = state.status.read().map_err(|e| e.to_string())?;
        if !status.enabled {
            return Err("Semantic search is not enabled".to_string());
        }
        if !status.api_configured {
            return Err("Embedding API is not configured".to_string());
        }
    }

    let min_score = match min_score {
        Some(score) => score,
        None => {
            let settings = crate::app_settings::load_settings_simple().unwrap_or_default();
            settings.min_similarity_score
        }
    };

    // Compute query embedding (blocking API call wrapped in spawn_blocking)
    let query_embedding = tokio::task::spawn_blocking(move || {
        super::embedding::compute_embedding(&query)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // Search in memory index
    let search_results = {
        let index = state.index.read().map_err(|e| e.to_string())?;
        index.search(&query_embedding, limit, min_score)
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
            "SELECT id, type, content, hash, created_at, is_favorited FROM history WHERE id = ?1",
            [sr.item_id],
            |row| {
                Ok(ClipboardItem {
                    id: row.get(0)?,
                    item_type: row.get(1)?,
                    content: row.get(2)?,
                    hash: row.get(3)?,
                    created_at: row.get(4)?,
                    is_favorited: row.get::<_, i64>(5).unwrap_or(0) != 0,
                })
            },
        );

        match item_result {
            Ok(item) => {
                results.push(SemanticSearchResult { item, score: sr.score });
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                logger::warning(
                    "Semantic",
                    &format!("Item {} not found in database", sr.item_id),
                );
                if let Ok(mut index) = state.index.write() {
                    index.remove(sr.item_id);
                }
            }
            Err(e) => {
                logger::error(
                    "Semantic",
                    &format!("Failed to fetch item {}: {}", sr.item_id, e),
                );
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
    logger::info(
        "Semantic",
        &format!("Semantic search {}", if enabled { "enabled" } else { "disabled" }),
    );
    Ok(())
}

/// Rebuild the in-memory index from database
#[tauri::command]
pub async fn rebuild_semantic_index(app: tauri::AppHandle) -> Result<usize, String> {
    let state = app.state::<SemanticState>();
    let db_state = app.state::<crate::DatabaseState>();

    let settings = crate::app_settings::load_settings_simple().unwrap_or_default();

    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.clear();
    }

    let count = {
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        super::db::load_embeddings_into_index(&conn, &mut index, settings.embedding_api_dim)
            .map_err(|e| e.to_string())?
    };

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
#[tauri::command]
pub async fn full_rebuild_index(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<SemanticState>();
    let db_state = app.state::<crate::DatabaseState>();

    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.clear();
    }

    let cleared_count = {
        let conn = db_state.conn.lock().map_err(|e| e.to_string())?;
        super::db::clear_all_embeddings(&conn).map_err(|e| e.to_string())?
    };

    {
        let mut status = state.status.write().map_err(|e| e.to_string())?;
        status.indexed_count = 0;
    }

    logger::info("Semantic", &format!("Full rebuild: cleared {} embeddings", cleared_count));

    super::embedding::index_all_items(app);

    Ok(format!("Cleared {} embeddings, re-indexing started", cleared_count))
}
