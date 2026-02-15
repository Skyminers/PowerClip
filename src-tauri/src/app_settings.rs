//! Application settings module - Save and load user preferences
//!
//! This module handles persistence of application settings using a JSON
//! configuration file in the application data directory.

use serde::{Deserialize, Serialize};
use std::fs;

use crate::config::APP_NAME;
use crate::logger;

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    /// Whether to automatically clean up old clipboard items
    pub auto_cleanup_enabled: bool,
    /// Maximum number of items to keep (only effective when auto_cleanup_enabled is true)
    pub max_items: i64,
    /// Hotkey modifiers (e.g., "Meta+Shift" for Cmd+Shift on macOS)
    pub hotkey_modifiers: String,
    /// Hotkey key code (e.g., "KeyV")
    pub hotkey_key: String,
    /// Number of items to display in the history list
    pub display_limit: i64,
    /// Maximum length for text preview
    pub preview_max_length: i64,
    /// Window opacity (0.5 - 1.0)
    pub window_opacity: f64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_cleanup_enabled: false,
            max_items: 100,
            hotkey_modifiers: if cfg!(target_os = "macos") {
                "Meta+Shift".to_string()
            } else {
                "Control+Shift".to_string()
            },
            hotkey_key: "KeyV".to_string(),
            display_limit: 50,
            preview_max_length: 200,
            window_opacity: 0.95,
        }
    }
}

/// Get the settings file path
fn settings_path() -> std::path::PathBuf {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(APP_NAME);
    data_dir.join("settings.json")
}

/// Save settings to file
#[inline]
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let settings_path = settings_path();

    // Ensure parent directory exists
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Serialize and write
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;

    logger::info(
        "Settings",
        &format!("Saved settings: auto_cleanup={}, max_items={}, hotkey={}+{}",
                 settings.auto_cleanup_enabled,
                 settings.max_items,
                 settings.hotkey_modifiers,
                 settings.hotkey_key),
    );

    Ok(())
}

/// Load settings from file
#[inline]
pub fn load_settings() -> Result<AppSettings, String> {
    let settings_path = settings_path();

    if !settings_path.exists() {
        logger::debug("Settings", "No settings file found, using defaults");
        return Ok(AppSettings::default());
    }

    let json = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    logger::debug(
        "Settings",
        &format!("Loaded settings: auto_cleanup={}, max_items={}, hotkey={}+{}",
                 settings.auto_cleanup_enabled,
                 settings.max_items,
                 settings.hotkey_modifiers,
                 settings.hotkey_key),
    );

    Ok(settings)
}
