//! Semantic search module - Local embedding-based search using EmbeddingGemma
//!
//! This module provides semantic search capabilities for clipboard content.
//! It uses llama-cpp-2 for local inference with EmbeddingGemma-300M model.

use std::sync::{Arc, Mutex, RwLock};
use serde::{Deserialize, Serialize};

use crate::logger;

pub mod db;
mod search;
pub mod model;
pub mod embedding;
pub mod commands;

pub use search::EmbeddingIndex;

/// Semantic model wrapper - stores only the model (context created per-inference)
pub struct SemanticModel {
    pub backend: llama_cpp_2::llama_backend::LlamaBackend,
    pub model: llama_cpp_2::model::LlamaModel,
}

/// Status of the semantic search feature
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SemanticStatus {
    /// Whether the model file has been downloaded
    pub model_downloaded: bool,
    /// Whether the model is loaded in memory
    pub model_loaded: bool,
    /// Download progress (0.0 - 1.0)
    pub download_progress: Option<f64>,
    /// Number of items with embeddings indexed
    pub indexed_count: usize,
    /// Total number of text items in history
    pub total_text_count: usize,
    /// Whether background indexing is in progress
    pub indexing_in_progress: bool,
    /// Whether semantic search is enabled in settings
    pub enabled: bool,
}

/// Global state for semantic search
#[derive(Clone)]
pub struct SemanticState {
    /// Lazily loaded model (None until first search)
    pub model: Arc<Mutex<Option<SemanticModel>>>,
    /// In-memory vector index
    pub index: Arc<RwLock<EmbeddingIndex>>,
    /// Current status for frontend queries
    pub status: Arc<RwLock<SemanticStatus>>,
}

impl SemanticState {
    pub fn new() -> Self {
        let index = EmbeddingIndex::new(crate::config::EMBEDDING_DIM);

        let model_path = crate::config::models_dir().join(crate::config::SEMANTIC_MODEL_FILENAME);
        let model_downloaded = model_path.exists();

        let status = SemanticStatus {
            model_downloaded,
            model_loaded: false,
            download_progress: None,
            indexed_count: 0,
            total_text_count: 0,
            indexing_in_progress: false,
            enabled: false,
        };

        logger::info("Semantic", &format!("Initialized, model_downloaded={}", model_downloaded));

        Self {
            model: Arc::new(Mutex::new(None)),
            index: Arc::new(RwLock::new(index)),
            status: Arc::new(RwLock::new(status)),
        }
    }

    /// Update total text count from database
    pub fn update_text_count(&self, db_conn: &rusqlite::Connection) {
        let count: i64 = db_conn
            .query_row("SELECT COUNT(*) FROM history WHERE type = 'text'", [], |row| row.get(0))
            .unwrap_or(0);

        if let Ok(mut status) = self.status.write() {
            status.total_text_count = count as usize;
        }
    }
}

impl Default for SemanticState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semantic_state_new() {
        let state = SemanticState::new();

        // Model should not be loaded initially
        assert!(state.model.lock().unwrap().is_none());

        // Index should be empty
        assert!(state.index.read().unwrap().is_empty());

        // Status should have default values
        let status = state.status.read().unwrap();
        assert!(!status.model_loaded);
        assert_eq!(status.indexed_count, 0);
        assert_eq!(status.total_text_count, 0);
        assert!(!status.indexing_in_progress);
        assert!(!status.enabled);
    }

    #[test]
    fn test_semantic_state_default() {
        let state = SemanticState::default();
        assert!(state.index.read().unwrap().is_empty());
    }

    #[test]
    fn test_semantic_status_default() {
        let status = SemanticStatus::default();

        assert!(!status.model_downloaded);
        assert!(!status.model_loaded);
        assert!(status.download_progress.is_none());
        assert_eq!(status.indexed_count, 0);
        assert_eq!(status.total_text_count, 0);
        assert!(!status.indexing_in_progress);
        assert!(!status.enabled);
    }

    #[test]
    fn test_semantic_status_serialization() {
        let status = SemanticStatus {
            model_downloaded: true,
            model_loaded: true,
            download_progress: Some(0.5),
            indexed_count: 100,
            total_text_count: 200,
            indexing_in_progress: true,
            enabled: true,
        };

        let json = serde_json::to_string(&status).expect("Failed to serialize");
        let deserialized: SemanticStatus =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(status.model_downloaded, deserialized.model_downloaded);
        assert_eq!(status.model_loaded, deserialized.model_loaded);
        assert_eq!(status.download_progress, deserialized.download_progress);
        assert_eq!(status.indexed_count, deserialized.indexed_count);
        assert_eq!(status.total_text_count, deserialized.total_text_count);
        assert_eq!(
            status.indexing_in_progress,
            deserialized.indexing_in_progress
        );
        assert_eq!(status.enabled, deserialized.enabled);
    }

    #[test]
    fn test_semantic_state_clone() {
        let state = SemanticState::new();
        let cloned = state.clone();

        // Both should share the same underlying data
        assert!(Arc::ptr_eq(&state.model, &cloned.model));
        assert!(Arc::ptr_eq(&state.index, &cloned.index));
        assert!(Arc::ptr_eq(&state.status, &cloned.status));
    }

    #[test]
    fn test_semantic_state_status_update() {
        let state = SemanticState::new();

        // Update status
        {
            let mut status = state.status.write().unwrap();
            status.enabled = true;
            status.indexed_count = 50;
        }

        // Verify update
        let status = state.status.read().unwrap();
        assert!(status.enabled);
        assert_eq!(status.indexed_count, 50);
    }
}
