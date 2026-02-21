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
