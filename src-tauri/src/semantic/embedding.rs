//! Embedding computation using llama-cpp-2
//!
//! Provides text embedding computation for semantic search.
//! Uses EmbeddingGemma-300M model via llama.cpp.

use std::sync::mpsc;

use tauri::Manager;

use crate::config::{EMBEDDING_DIM, EMBEDDING_BATCH_SIZE, MAX_EMBEDDING_TOKENS};
use crate::logger;

use super::SemanticState;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::AddBos;

/// Compute embedding for a text string.
///
/// Returns a normalized embedding vector truncated to EMBEDDING_DIM dimensions.
///
/// # Arguments
/// * `state` - Semantic state containing the loaded model
/// * `text` - Input text to embed
///
/// # Returns
/// * `Ok(Vec<f32>)` - Normalized embedding vector
/// * `Err(String)` - Error message if computation fails
pub fn compute_embedding(state: &SemanticState, text: &str) -> Result<Vec<f32>, String> {
    let model_guard = state.model.lock().map_err(|e| e.to_string())?;
    let semantic_model = model_guard.as_ref().ok_or("Model not loaded")?;

    // Create context with embeddings enabled
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(std::num::NonZeroU32::new(MAX_EMBEDDING_TOKENS as u32))
        .with_n_batch(MAX_EMBEDDING_TOKENS as u32)
        .with_n_ubatch(MAX_EMBEDDING_TOKENS as u32)
        .with_embeddings(true);

    let mut ctx = semantic_model
        .model
        .new_context(&semantic_model.backend, ctx_params)
        .map_err(|e| format!("Failed to create context: {}", e))?;

    // Tokenize input text
    let mut tokens = semantic_model
        .model
        .str_to_token(text, AddBos::Always)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    if tokens.is_empty() {
        return Err("Empty token sequence".to_string());
    }

    // Truncate if exceeds max tokens
    if tokens.len() > MAX_EMBEDDING_TOKENS {
        tokens.truncate(MAX_EMBEDDING_TOKENS);
        logger::debug(
            "Semantic",
            &format!("Truncated tokens to {}", MAX_EMBEDDING_TOKENS),
        );
    }

    // Create batch and add tokens
    let mut batch = LlamaBatch::new(tokens.len(), 1);
    batch
        .add_sequence(&tokens, 0, true)
        .map_err(|e| format!("Failed to add sequence: {}", e))?;

    // Run encode (embedding model inference)
    ctx.encode(&mut batch)
        .map_err(|e| format!("Encode failed: {}", e))?;

    // Get sequence-level pooled embedding
    let embeddings = ctx
        .embeddings_seq_ith(0)
        .map_err(|e| format!("Failed to get embeddings: {}", e))?;

    // Truncate to target dimension (MRL technique)
    let truncated: Vec<f32> = embeddings.iter().take(EMBEDDING_DIM).copied().collect();

    // L2 normalize for cosine similarity
    Ok(l2_normalize(&truncated))
}

/// L2 normalize a vector in-place.
///
/// For normalized vectors, dot product equals cosine similarity.
fn l2_normalize(vec: &[f32]) -> Vec<f32> {
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm < 1e-10 {
        return vec.to_vec();
    }

    vec.iter().map(|x| x / norm).collect()
}

/// Index a single clipboard item.
///
/// Computes embedding, saves to database, and updates in-memory index.
/// Called when new clipboard content is saved.
///
/// # Arguments
/// * `app` - Tauri app handle for accessing state
/// * `item_id` - Database ID of the item
/// * `content` - Text content to embed
pub fn index_single_item(app: &tauri::AppHandle, item_id: i64, content: &str) {
    let state = match app.try_state::<SemanticState>() {
        Some(s) => s,
        None => {
            logger::warning("Semantic", "SemanticState not available");
            return;
        }
    };

    // Check if semantic search is enabled and model downloaded
    let enabled = state
        .status
        .read()
        .map(|s| s.enabled && s.model_downloaded)
        .unwrap_or(false);

    if !enabled {
        return;
    }

    // Ensure model is loaded
    if let Err(e) = super::model::ensure_model_loaded(&state) {
        logger::error("Semantic", &format!("Failed to load model: {}", e));
        return;
    }

    // Compute embedding
    let embedding = match compute_embedding(&state, content) {
        Ok(e) => e,
        Err(e) => {
            logger::error("Semantic", &format!("Failed to compute embedding: {}", e));
            return;
        }
    };

    // Save to database
    if let Some(db_state) = app.try_state::<crate::DatabaseState>() {
        if let Ok(conn) = db_state.conn.lock() {
            if let Err(e) = super::db::save_embedding(&conn, item_id, &embedding) {
                logger::error("Semantic", &format!("Failed to save embedding: {}", e));
                return;
            }
        }
    }

    // Update in-memory index
    if let Ok(mut index) = state.index.write() {
        index.upsert(item_id, &embedding);
    }

    // Update status
    if let Ok(mut status) = state.status.write() {
        status.indexed_count = status.indexed_count.saturating_add(1);
    }

    logger::debug("Semantic", &format!("Indexed item {}", item_id));
}

/// Bulk index all existing text items without embeddings.
///
/// Called when semantic search is first enabled or after model download.
/// Runs in background thread with batch database writes for efficiency.
///
/// # Arguments
/// * `app` - Tauri app handle
pub fn index_all_items(app: tauri::AppHandle) {
    let state = match app.try_state::<SemanticState>() {
        Some(s) => s.inner().clone(),
        None => {
            logger::warning("Semantic", "SemanticState not available for bulk indexing");
            return;
        }
    };

    // Check if already indexing
    if state.status.read().map(|s| s.indexing_in_progress).unwrap_or(false) {
        logger::info("Semantic", "Bulk indexing already in progress");
        return;
    }

    // Get items that need indexing
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

    let total = items_to_index.len();
    logger::info("Semantic", &format!("Starting bulk indexing of {} items", total));

    // Set indexing in progress
    if let Ok(mut status) = state.status.write() {
        status.indexing_in_progress = true;
    }

    // Ensure model is loaded
    if let Err(e) = super::model::ensure_model_loaded(&state) {
        logger::error("Semantic", &format!("Failed to load model: {}", e));
        if let Ok(mut status) = state.status.write() {
            status.indexing_in_progress = false;
        }
        return;
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
                            logger::warning("Semantic", &format!(
                                "Failed to save embedding for item {}: {}",
                                item_id, e
                            ));
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
            // Check if still enabled
            let still_enabled = state.status.read().map(|s| s.enabled).unwrap_or(false);

            if !still_enabled {
                logger::info("Semantic", "Semantic search disabled, stopping bulk indexing");
                break;
            }

            // Compute embedding
            match compute_embedding(&state, &content) {
                Ok(embedding) => {
                    // Update in-memory index
                    if let Ok(mut idx) = state.index.write() {
                        idx.upsert(item_id, &embedding);
                    }

                    // Add to batch for database write
                    batch.push((item_id, embedding));
                    indexed += 1;

                    // Send batch when full
                    if batch.len() >= EMBEDDING_BATCH_SIZE {
                        if tx.send(std::mem::take(&mut batch)).is_err() {
                            logger::warning("Semantic", "Failed to send batch to database writer");
                        }
                    }
                }
                Err(e) => {
                    logger::warning("Semantic", &format!("Failed to embed item {}: {}", item_id, e));
                    failed += 1;
                }
            }

            // Update progress every 10 items
            if (indexed + failed) % 10 == 0 {
                if let Ok(mut status) = state.status.write() {
                    status.indexed_count = status.indexed_count.saturating_add(10);
                }
            }
        }

        // Send remaining batch
        if !batch.is_empty() {
            let _ = tx.send(batch);
        }

        // Signal end of indexing
        let _ = tx.send(Vec::new());

        // Final status update
        if let Ok(mut status) = state.status.write() {
            status.indexing_in_progress = false;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_l2_normalize() {
        let input = vec![3.0, 4.0];
        let normalized = l2_normalize(&input);

        assert!((normalized[0] - 0.6).abs() < 0.001);
        assert!((normalized[1] - 0.8).abs() < 0.001);

        // Check norm is 1
        let norm: f32 = normalized.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_l2_normalize_zero() {
        let input = vec![0.0, 0.0, 0.0];
        let normalized = l2_normalize(&input);
        assert_eq!(normalized, input);
    }

    #[test]
    fn test_l2_normalize_unit() {
        let input = vec![1.0, 0.0, 0.0];
        let normalized = l2_normalize(&input);
        assert!((normalized[0] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_l2_normalize_negative() {
        let input = vec![-3.0, -4.0];
        let normalized = l2_normalize(&input);

        assert!((normalized[0] - (-0.6)).abs() < 0.001);
        assert!((normalized[1] - (-0.8)).abs() < 0.001);
    }
}
