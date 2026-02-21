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
