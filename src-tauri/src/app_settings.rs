//! Application settings - User preferences persistence

use serde::{Deserialize, Serialize};
use std::fs;

use crate::config::settings_path;

/// Application settings shared between backend and frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    pub auto_cleanup_enabled: bool,
    pub max_items: i64,
    pub hotkey_modifiers: String,
    pub hotkey_key: String,
    pub window_opacity: f64,
    pub auto_paste_enabled: bool,
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
            window_opacity: 0.95,
            auto_paste_enabled: false,
        }
    }
}

/// Save settings to file.
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Load settings from file, returning defaults if not found.
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}
