//! Configuration module - Centralized application configuration and paths
//!
//! This module provides unified access to all application paths and constants.
//! All paths are derived from the platform-appropriate data directory.

use std::path::PathBuf;
use std::sync::OnceLock;

/// Application name
pub const APP_NAME: &str = "PowerClip";

/// Database settings
pub const HISTORY_LIMIT: i64 = 1000; // Default limit
pub const CLIPBOARD_POLL_INTERVAL_MS: u64 = 100; // 100 ms

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

/// Get the images directory path
#[inline]
pub fn images_dir() -> PathBuf {
    data_dir().join("images")
}

/// Ensure all required directories exist
#[inline]
pub fn ensure_dirs() {
    let data = data_dir();
    let _ = std::fs::create_dir_all(data);
    let _ = std::fs::create_dir_all(images_dir());
}
