//! Window configuration module - Save and load window position and size
//!
//! This module handles persistence of window geometry (position and size)
//! using a JSON configuration file in the application data directory.

use serde::{Deserialize, Serialize};
use std::fs;

use crate::config::window_config_path;
use crate::logger;

/// Window geometry configuration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WindowConfig {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            x: 100,
            y: 100,
            width: 450,
            height: 400,
        }
    }
}

/// Save window configuration to file
#[inline]
pub fn save_window_config(config: &WindowConfig) -> Result<(), String> {
    let config_path = window_config_path();

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    // Serialize and write
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&config_path, json).map_err(|e| e.to_string())?;

    logger::debug(
        "WindowConfig",
        &format!("Saved window config: x={}, y={}, w={}, h={}",
                 config.x, config.y, config.width, config.height),
    );

    Ok(())
}

/// Load window configuration from file
#[inline]
pub fn load_window_config() -> Result<WindowConfig, String> {
    let config_path = window_config_path();

    if !config_path.exists() {
        logger::debug("WindowConfig", "No config file found, using defaults");
        return Ok(WindowConfig::default());
    }

    let json = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: WindowConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    logger::debug(
        "WindowConfig",
        &format!("Loaded window config: x={}, y={}, w={}, h={}",
                 config.x, config.y, config.width, config.height),
    );

    Ok(config)
}
