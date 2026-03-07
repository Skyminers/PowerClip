//! Configuration module - Centralized application configuration and paths
//!
//! This module provides unified access to all application paths and constants.
//! All paths are derived from the platform-appropriate data directory.

use std::path::PathBuf;
use std::sync::OnceLock;

/// Application name
pub const APP_NAME: &str = "PowerClip";

/// Clipboard polling interval in milliseconds
pub const CLIPBOARD_POLL_INTERVAL_MS: u64 = 100;

// Semantic search configuration
/// Embedding vector dimension (MRL truncation from 2560)
/// Higher = better accuracy but more memory. Options: 256, 512, 768, 1024, 2560
pub const EMBEDDING_DIM: usize = 768;
/// Maximum tokens per embedding (llama.cpp context limit)
pub const MAX_EMBEDDING_TOKENS: usize = 512;
/// Minimum model file size in bytes (sanity check: 100MB)
pub const MIN_MODEL_SIZE_BYTES: u64 = 100 * 1024 * 1024;
/// Maximum embeddings to keep in memory (LRU eviction)
pub const MAX_EMBEDDINGS_IN_MEMORY: usize = 50_000;
/// Minimum similarity score to include in results (0.0 - 1.0)
/// Lower = more results but potentially less relevant
pub const MIN_SIMILARITY_SCORE: f32 = 0.2;
/// Batch size for bulk database operations
pub const EMBEDDING_BATCH_SIZE: usize = 100;
/// Semantic model filename
pub const SEMANTIC_MODEL_FILENAME: &str = "embeddinggemma-300m-Q8_0.gguf";
/// Semantic model download URL
pub const SEMANTIC_MODEL_URL: &str = "https://huggingface.co/ggml-org/embeddinggemma-300M-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf";

/// Cache the data directory path
static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Get the application data directory
/// Returns the platform-appropriate data directory:
/// - Linux: ~/.local/share/PowerClip
/// - macOS: ~/Library/Application Support/PowerClip
/// - Windows: %APPDATA%/PowerClip
#[inline]
pub fn data_dir() -> &'static PathBuf {
    DATA_DIR.get_or_init(|| {
        dirs::data_dir()
            .unwrap_or(PathBuf::from("."))
            .join(APP_NAME)
    })
}

/// Get the database file path
#[inline]
pub fn db_path() -> PathBuf {
    data_dir().join("clipboard.db")
}

/// Get the log file path
#[inline]
pub fn log_path() -> PathBuf {
    data_dir().join("powerclip.log")
}

/// Get the window configuration file path
#[inline]
pub fn window_config_path() -> PathBuf {
    data_dir().join("window_config.json")
}

/// Get the settings file path
#[inline]
pub fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

/// Get the images directory path
#[inline]
pub fn images_dir() -> PathBuf {
    data_dir().join("images")
}

/// Get the models directory path
#[inline]
pub fn models_dir() -> PathBuf {
    data_dir().join("models")
}

/// Ensure all required directories exist
#[inline]
pub fn ensure_dirs() {
    let data = data_dir();
    let _ = std::fs::create_dir_all(data);
    let _ = std::fs::create_dir_all(images_dir());
    let _ = std::fs::create_dir_all(models_dir());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_name() {
        assert_eq!(APP_NAME, "PowerClip");
    }

    #[test]
    fn test_constants() {
        assert_eq!(CLIPBOARD_POLL_INTERVAL_MS, 100);
        assert_eq!(EMBEDDING_DIM, 768);
        assert_eq!(MAX_EMBEDDING_TOKENS, 512);
        assert!(MIN_MODEL_SIZE_BYTES > 0);
        assert!(MAX_EMBEDDINGS_IN_MEMORY > 0);
        assert!(MIN_SIMILARITY_SCORE >= 0.0 && MIN_SIMILARITY_SCORE <= 1.0);
        assert!(!SEMANTIC_MODEL_FILENAME.is_empty());
        assert!(!SEMANTIC_MODEL_URL.is_empty());
    }

    #[test]
    fn test_data_dir_contains_app_name() {
        let dir = data_dir();
        assert!(dir.to_string_lossy().contains(APP_NAME));
    }

    #[test]
    fn test_db_path() {
        let path = db_path();
        assert!(path.to_string_lossy().ends_with("clipboard.db"));
        assert!(path.to_string_lossy().contains(APP_NAME));
    }

    #[test]
    fn test_log_path() {
        let path = log_path();
        assert!(path.to_string_lossy().ends_with("powerclip.log"));
    }

    #[test]
    fn test_window_config_path() {
        let path = window_config_path();
        assert!(path.to_string_lossy().ends_with("window_config.json"));
    }

    #[test]
    fn test_settings_path() {
        let path = settings_path();
        assert!(path.to_string_lossy().ends_with("settings.json"));
    }

    #[test]
    fn test_images_dir() {
        let path = images_dir();
        assert!(path.to_string_lossy().ends_with("images"));
    }

    #[test]
    fn test_models_dir() {
        let path = models_dir();
        assert!(path.to_string_lossy().ends_with("models"));
    }

    #[test]
    fn test_paths_are_consistent() {
        // All paths should be under the data directory
        let data = data_dir();
        assert!(db_path().starts_with(data));
        assert!(log_path().starts_with(data));
        assert!(window_config_path().starts_with(data));
        assert!(settings_path().starts_with(data));
        assert!(images_dir().starts_with(data));
        assert!(models_dir().starts_with(data));
    }

    #[test]
    fn test_data_dir_is_cached() {
        // Call data_dir twice and verify they return the same pointer
        let dir1 = data_dir();
        let dir2 = data_dir();
        assert!(std::ptr::eq(dir1, dir2));
    }
}
