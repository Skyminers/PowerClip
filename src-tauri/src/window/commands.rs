//! Window commands - Window management Tauri commands

use crate::window_config::WindowConfig;
use crate::logger;

/// Save current window position and size
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

    crate::window_config::save_window_config(&config)?;
    logger::debug("Window", &format!("Window state saved: {}x{} at ({},{})",
        config.width, config.height, config.x, config.y));

    Ok(())
}

/// Get current window configuration
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

/// Move window to specified position
#[tauri::command]
pub async fn move_window(window: tauri::WebviewWindow, x: i32, y: i32) -> Result<(), String> {
    let position = tauri::Position::Physical(tauri::PhysicalPosition::new(x, y));
    window.set_position(position).map_err(|e| e.to_string())?;
    logger::debug("Window", &format!("Window moved to ({}, {})", x, y));
    Ok(())
}

/// Resize window to specified size
#[tauri::command]
pub async fn resize_window(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    let size = tauri::Size::Physical(tauri::PhysicalSize::new(width, height));
    window.set_size(size).map_err(|e| e.to_string())?;
    logger::debug("Window", &format!("Window resized to {}x{}", width, height));
    Ok(())
}

/// Hide window and release focus
#[tauri::command]
pub async fn hide_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        crate::window::WindowManager::hide(&window)?;
    }

    #[cfg(target_os = "macos")]
    {
        use crate::window::PREVIOUS_APP_BUNDLE_ID;
        if let Ok(prev) = PREVIOUS_APP_BUNDLE_ID.lock() {
            if let Some(ref bundle_id) = *prev {
                crate::window::macos::activate_app(bundle_id);
            }
        }
    }

    Ok(())
}

/// Get the frontmost application bundle identifier before showing our window
#[tauri::command]
pub async fn get_previous_app() -> Result<String, String> {
    // Get from hotkey handler (captured when hotkey was pressed)
    if let Some(bundle_id) = crate::hotkey::get_previous_app_from_hotkey() {
        logger::info("Commands", &format!("Previous app from hotkey handler: {}", bundle_id));
        return Ok(bundle_id);
    }

    // Fallback: query directly (but this might return "missing value")
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        logger::info("Commands", "Getting previous app bundle ID (fallback)...");

        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get bundle identifier of first process whose frontmost is true"])
            .output()
            .map_err(|e| {
                logger::error("Commands", &format!("Failed to get previous app: {}", e));
                e.to_string()
            })?;

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        logger::info("Commands", &format!("Previous app bundle ID (fallback): {}", result));
        Ok(result)
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(String::new())
    }
}

/// Restore focus to the previous application
#[tauri::command]
pub async fn activate_previous_app(bundle_id: String) -> Result<(), String> {
    logger::info("Commands", &format!("Attempting to activate previous app: {}", bundle_id));

    if bundle_id.is_empty() {
        logger::info("Commands", "Bundle ID is empty, skipping");
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let result = Command::new("osascript")
            .args(["-e", &format!("tell application id \"{}\" to activate", bundle_id)])
            .output();

        match result {
            Ok(output) => {
                if output.status.success() {
                    logger::info("Commands", &format!("Successfully activated: {}", bundle_id));
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    logger::error("Commands", &format!("Failed to activate: {}", stderr));
                }
            }
            Err(e) => {
                logger::error("Commands", &format!("Error activating app: {}", e));
            }
        }
    }

    Ok(())
}
