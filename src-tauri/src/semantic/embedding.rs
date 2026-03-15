//! Embedding computation via OpenAI-compatible API
//!
//! Provides text embedding via an external API for semantic search.

use std::sync::mpsc;

use tauri::Manager;

use crate::config::EMBEDDING_BATCH_SIZE;
use crate::logger;

use super::SemanticState;

/// Compute an embedding for the given text using the configured API.
///
/// Loads API credentials from settings on each call so that settings changes
/// take effect without a restart.
pub fn compute_embedding(text: &str) -> Result<Vec<f32>, String> {
    let settings = crate::app_settings::load_settings_simple()
        .map_err(|e| format!("Failed to load settings: {}", e))?;

    if !super::api::is_configured(&settings.embedding_api_url, &settings.embedding_api_key) {
        return Err(
            "Embedding API not configured. Set embedding_api_url and embedding_api_key in settings."
                .to_string(),
        );
    }

    super::api::fetch_embedding(
        text,
        &settings.embedding_api_url,
        &settings.embedding_api_key,
        &settings.embedding_api_model,
    )
}

/// Index a single clipboard item.
///
/// Computes embedding via API, saves to database, and updates in-memory index.
/// Called when new clipboard content is saved.
pub fn index_single_item(app: &tauri::AppHandle, item_id: i64, content: &str) {
    let state = match app.try_state::<SemanticState>() {
        Some(s) => s,
        None => {
            logger::warning("Semantic", "SemanticState not available");
            return;
        }
    };

    // Only index if semantic search is enabled and API is configured
    let should_index = state
        .status
        .read()
        .map(|s| s.enabled && s.api_configured)
        .unwrap_or(false);

    if !should_index {
        return;
    }

    let embedding = match compute_embedding(content) {
        Ok(e) => e,
        Err(e) => {
            logger::debug("Semantic", &format!("Failed to index item {}: {}", item_id, e));
            return;
        }
    };

    if let Some(db_state) = app.try_state::<crate::DatabaseState>() {
        if let Ok(conn) = db_state.conn.lock() {
            if let Err(e) = super::db::save_embedding(&conn, item_id, &embedding) {
                logger::error("Semantic", &format!("Failed to save embedding: {}", e));
                return;
            }
        }
    }

    if let Ok(mut index) = state.index.write() {
        index.upsert(item_id, &embedding);
    }

    if let Ok(mut status) = state.status.write() {
        status.indexed_count = status.indexed_count.saturating_add(1);
    }

    logger::debug("Semantic", &format!("Indexed item {}", item_id));
}

/// Bulk index all existing text items without embeddings.
///
/// Called when semantic search is first enabled or when API is first configured.
/// Runs in a background thread with batch database writes for efficiency.
pub fn index_all_items(app: tauri::AppHandle) {
    let state = match app.try_state::<SemanticState>() {
        Some(s) => s.inner().clone(),
        None => {
            logger::warning("Semantic", "SemanticState not available for bulk indexing");
            return;
        }
    };

    if state.status.read().map(|s| s.indexing_in_progress).unwrap_or(false) {
        logger::info("Semantic", "Bulk indexing already in progress");
        return;
    }

    let items_to_index: Vec<(i64, String)> = match get_unindexed_items(&app) {
        Ok(items) => items,
        Err(e) => {
            logger::error("Semantic", &format!("Failed to get unindexed items: {}", e));
            return;
        }
    };

    if items_to_index.is_empty() {
        logger::info("Semantic", "No items to index");
        return;
    }

    logger::info("Semantic", &format!("Starting bulk indexing of {} items", items_to_index.len()));

    if let Ok(mut status) = state.status.write() {
        status.indexing_in_progress = true;
    }

    // Channel for batch database writes
    let (tx, rx) = mpsc::channel::<Vec<(i64, Vec<f32>)>>();

    // Spawn database writer thread
    let db_app = app.clone();
    std::thread::spawn(move || {
        while let Ok(batch) = rx.recv() {
            if batch.is_empty() {
                break;
            }
            if let Some(db_state) = db_app.try_state::<crate::DatabaseState>() {
                if let Ok(conn) = db_state.conn.lock() {
                    for (item_id, embedding) in batch {
                        if let Err(e) = super::db::save_embedding(&conn, item_id, &embedding) {
                            logger::warning(
                                "Semantic",
                                &format!("Failed to save embedding for item {}: {}", item_id, e),
                            );
                        }
                    }
                }
            }
        }
        logger::debug("Semantic", "Database writer thread finished");
    });

    // Run indexing in background thread
    std::thread::spawn(move || {
        let mut indexed = 0usize;
        let mut failed = 0usize;
        let mut batch: Vec<(i64, Vec<f32>)> = Vec::with_capacity(EMBEDDING_BATCH_SIZE);

        for (item_id, content) in items_to_index {
            let still_enabled = state.status.read().map(|s| s.enabled).unwrap_or(false);
            if !still_enabled {
                logger::info("Semantic", "Semantic search disabled, stopping bulk indexing");
                break;
            }

            match compute_embedding(&content) {
                Ok(embedding) => {
                    if let Ok(mut idx) = state.index.write() {
                        idx.upsert(item_id, &embedding);
                    }
                    batch.push((item_id, embedding));
                    indexed += 1;

                    if batch.len() >= EMBEDDING_BATCH_SIZE {
                        if tx.send(std::mem::take(&mut batch)).is_err() {
                            logger::warning("Semantic", "Failed to send batch to database writer");
                        }
                    }
                }
                Err(e) => {
                    logger::warning(
                        "Semantic",
                        &format!("Failed to embed item {}: {}", item_id, e),
                    );
                    failed += 1;
                }
            }

            if (indexed + failed) % 10 == 0 {
                if let Ok(mut status) = state.status.write() {
                    status.indexed_count = indexed;
                }
            }
        }

        if !batch.is_empty() {
            let _ = tx.send(batch);
        }
        let _ = tx.send(Vec::new()); // signal end

        if let Ok(mut status) = state.status.write() {
            status.indexing_in_progress = false;
            status.indexed_count = indexed;
        }

        logger::info(
            "Semantic",
            &format!("Bulk indexing complete: {} indexed, {} failed", indexed, failed),
        );
    });
}

/// Get all text items from database that don't have embeddings yet.
fn get_unindexed_items(app: &tauri::AppHandle) -> Result<Vec<(i64, String)>, String> {
    let db_state = app
        .try_state::<crate::DatabaseState>()
        .ok_or("DatabaseState not available")?;

    let conn = db_state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT h.id, h.content FROM history h
             WHERE h.type = 'text'
             AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.item_id = h.id)
             ORDER BY h.created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?;

    Ok(rows.filter_map(|r| r.ok()).collect())
}
