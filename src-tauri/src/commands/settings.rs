//! Settings commands - Application preferences management

use tauri::Manager;

use crate::app_settings::{self, AppSettings};
use crate::config::settings_path;
use crate::logger;

/// Get current application settings.
#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    app_settings::load_settings()
}

/// Save application settings and re-register hotkey.
#[tauri::command]
pub async fn save_settings(
    settings: AppSettings,
    app: tauri::AppHandle,
) -> Result<(), String> {
    app_settings::save_settings(&settings)?;

    let state = app.state::<crate::HotkeyState>();
    let manager = state.manager.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        crate::hotkey::register_hotkey_with_settings(
            &manager,
            &state.current_hotkey,
            &state.handler_installed,
            &window,
            &settings.hotkey_modifiers,
            &settings.hotkey_key,
        )?;
    }

    logger::info("Settings", "Settings saved and hotkey updated");
    Ok(())
}

/// Set whether settings dialog is open (prevents hide-on-blur).
#[tauri::command]
pub async fn set_settings_dialog_open(
    open: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    *state.settings_open.lock().map_err(|e| e.to_string())? = open;
    Ok(())
}

/// Get the settings file path (so the frontend can display it).
#[tauri::command]
pub async fn get_settings_path() -> Result<String, String> {
    Ok(settings_path().to_string_lossy().to_string())
}

/// Open the settings file in the system default editor.
#[tauri::command]
pub async fn open_settings_file() -> Result<(), String> {
    let path = settings_path();

    // Ensure the file exists before opening
    if !path.exists() {
        let settings = app_settings::load_settings()?;
        app_settings::save_settings(&settings)?;
    }

    open::that(&path).map_err(|e| format!("Failed to open settings file: {}", e))
}
