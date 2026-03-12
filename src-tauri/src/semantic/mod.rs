//! Semantic search module - API-based embedding search
//!
//! This module provides semantic search capabilities for clipboard content.
//! It uses an OpenAI-compatible embeddings API for text embedding.

use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};

use crate::logger;

pub mod db;
mod search;
pub mod api;
pub mod embedding;
pub mod commands;

pub use search::EmbeddingIndex;

/// Status of the semantic search feature
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SemanticStatus {
    /// Number of items with embeddings indexed
    pub indexed_count: usize,
    /// Total number of text items in history
    pub total_text_count: usize,
    /// Whether background indexing is in progress
    pub indexing_in_progress: bool,
    /// Whether semantic search is enabled in settings
    pub enabled: bool,
    /// Whether the embedding API is configured (key + url present)
    pub api_configured: bool,
}

/// Global state for semantic search
#[derive(Clone)]
pub struct SemanticState {
    /// In-memory vector index
    pub index: Arc<RwLock<EmbeddingIndex>>,
    /// Current status for frontend queries
    pub status: Arc<RwLock<SemanticStatus>>,
}

impl SemanticState {
    pub fn new(dim: usize) -> Self {
        let index = EmbeddingIndex::new(dim);
        let status = SemanticStatus::default();

        logger::info("Semantic", "Initialized (API mode)");

        Self {
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
        Self::new(1536)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semantic_state_new() {
        let state = SemanticState::new(1536);

        // Index should be empty
        assert!(state.index.read().unwrap().is_empty());

        // Status should have default values
        let status = state.status.read().unwrap();
        assert_eq!(status.indexed_count, 0);
        assert_eq!(status.total_text_count, 0);
        assert!(!status.indexing_in_progress);
        assert!(!status.enabled);
        assert!(!status.api_configured);
    }

    #[test]
    fn test_semantic_state_default() {
        let state = SemanticState::default();
        assert!(state.index.read().unwrap().is_empty());
    }

    #[test]
    fn test_semantic_status_default() {
        let status = SemanticStatus::default();

        assert_eq!(status.indexed_count, 0);
        assert_eq!(status.total_text_count, 0);
        assert!(!status.indexing_in_progress);
        assert!(!status.enabled);
        assert!(!status.api_configured);
    }

    #[test]
    fn test_semantic_status_serialization() {
        let status = SemanticStatus {
            indexed_count: 100,
            total_text_count: 200,
            indexing_in_progress: true,
            enabled: true,
            api_configured: true,
        };

        let json = serde_json::to_string(&status).expect("Failed to serialize");
        let deserialized: SemanticStatus =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(status.indexed_count, deserialized.indexed_count);
        assert_eq!(status.total_text_count, deserialized.total_text_count);
        assert_eq!(status.indexing_in_progress, deserialized.indexing_in_progress);
        assert_eq!(status.enabled, deserialized.enabled);
        assert_eq!(status.api_configured, deserialized.api_configured);
    }

    #[test]
    fn test_semantic_state_clone() {
        let state = SemanticState::new(1536);
        let cloned = state.clone();

        // Both should share the same underlying data
        assert!(Arc::ptr_eq(&state.index, &cloned.index));
        assert!(Arc::ptr_eq(&state.status, &cloned.status));
    }

    #[test]
    fn test_semantic_state_status_update() {
        let state = SemanticState::new(1536);

        {
            let mut status = state.status.write().unwrap();
            status.enabled = true;
            status.indexed_count = 50;
        }

        let status = state.status.read().unwrap();
        assert!(status.enabled);
        assert_eq!(status.indexed_count, 50);
    }
}
