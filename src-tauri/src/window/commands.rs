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

/// Get current window configuration in logical (CSS) pixels.
///
/// All JS-facing window commands use logical units so the frontend never
/// needs to know about the device pixel ratio.
#[tauri::command]
pub async fn get_window_state(window: tauri::WebviewWindow) -> Result<WindowConfig, String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;

    Ok(WindowConfig {
        x: (position.x as f64 / scale) as i32,
        y: (position.y as f64 / scale) as i32,
        width: (size.width as f64 / scale).round() as u32,
        height: (size.height as f64 / scale).round() as u32,
    })
}

/// Move window to specified position (coordinates are in logical / CSS pixels).
#[tauri::command]
pub async fn move_window(window: tauri::WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    let position = tauri::Position::Logical(tauri::LogicalPosition::new(x as f64, y as f64));
    window.set_position(position).map_err(|e| e.to_string())
}

/// Resize window to specified dimensions (logical / CSS pixels).
#[tauri::command]
pub async fn resize_window(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    let size = tauri::Size::Logical(tauri::LogicalSize::new(width as f64, height as f64));
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
