//! Window commands - Window management Tauri commands

use crate::window_config::WindowConfig;
use crate::logger;
use crate::window::PREVIOUS_APP_BUNDLE_ID;

#[cfg(target_os = "macos")]
mod macos {
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, class};

    /// Activate an app by bundle identifier (~0-5ms)
    pub fn activate_app(bundle_id: &str) -> bool {
        unsafe {
            let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];

            // Get running applications
            let apps: *mut AnyObject = msg_send![workspace, runningApplications];
            let count: usize = msg_send![apps, count];

            for i in 0..count {
                let app: *mut AnyObject = msg_send![apps, objectAtIndex: i];
                let bid: *mut AnyObject = msg_send![app, bundleIdentifier];
                if bid.is_null() {
                    continue;
                }
                let utf8: *const std::ffi::c_char = msg_send![bid, UTF8String];
                if utf8.is_null() {
                    continue;
                }
                let current = std::ffi::CStr::from_ptr(utf8).to_string_lossy();
                if current == bundle_id {
                    let _: bool = msg_send![app, activateWithOptions: 1usize]; // NSApplicationActivateIgnoringOtherApps
                    return true;
                }
            }
            false
        }
    }
}

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
        if let Ok(prev) = PREVIOUS_APP_BUNDLE_ID.lock() {
            if let Some(ref bundle_id) = *prev {
                macos::activate_app(bundle_id);
            }
        }
    }

    Ok(())
}
