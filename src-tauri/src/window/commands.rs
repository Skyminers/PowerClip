//! Window commands - Tauri command handlers for window operations

use crate::window::config::WindowConfig;

/// Save current window position and size.
#[tauri::command]
pub async fn save_window_state(window: tauri::WebviewWindow) -> Result<(), String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    let config = WindowConfig {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    };

    crate::window::config::save_window_config(&config)
}

/// Get current window configuration.
#[tauri::command]
pub async fn get_window_state(window: tauri::WebviewWindow) -> Result<WindowConfig, String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    Ok(WindowConfig {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

/// Move window to specified position.
#[tauri::command]
pub async fn move_window(window: tauri::WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    let position = tauri::Position::Physical(tauri::PhysicalPosition::new(x, y));
    window.set_position(position).map_err(|e| e.to_string())
}

/// Resize window to specified dimensions.
#[tauri::command]
pub async fn resize_window(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    let size = tauri::Size::Physical(tauri::PhysicalSize::new(width, height));
    window.set_size(size).map_err(|e| e.to_string())
}

/// Hide window and restore focus to previous application.
#[tauri::command]
pub async fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        crate::window::hide(&window)?;
    }
    Ok(())
}
