//! Application settings - User preferences persistence

use serde::{Deserialize, Serialize};
use std::fs;

use crate::config::settings_path;

/// A user-configured extension that processes clipboard content via an external command.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Extension {
    pub name: String,
    pub command: String,
    pub timeout: i64,           // -1=wait until done, 0=fire and forget, >0=timeout in ms
    pub close_on_success: bool,
}

/// Application settings shared between backend and frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    pub auto_cleanup_enabled: bool,
    pub max_items: i64,
    pub hotkey_modifiers: String,
    pub hotkey_key: String,
    pub window_opacity: f64,
    pub auto_paste_enabled: bool,
    #[serde(default)]
    pub extensions: Vec<Extension>,
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
            extensions: vec![
                Extension {
                    name: "转为大写".to_string(),
                    command: if cfg!(target_os = "windows") {
                        "powershell -Command \"$input | ForEach-Object { $_.ToUpper() }\"".to_string()
                    } else {
                        "tr '[:lower:]' '[:upper:]'".to_string()
                    },
                    timeout: -1,
                    close_on_success: true,
                },
            ],
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
///
/// When upgrading from a version without extensions, the field will be missing
/// from JSON. We detect this and populate with defaults so existing users get
/// the demo extension on first upgrade. Once saved, it won't be re-added.
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;

    // Check if the "extensions" key is present in the raw JSON.
    // If missing (upgrade from older version), fill in defaults.
    let raw: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let extensions_missing = raw.get("extensions").is_none();

    let mut settings: AppSettings = serde_json::from_value(raw).map_err(|e| e.to_string())?;

    if extensions_missing {
        settings.extensions = AppSettings::default().extensions;
        // Persist so we don't repeat this migration
        let _ = save_settings(&settings);
    }

    Ok(settings)
}
