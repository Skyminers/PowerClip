//! Window module - Window management utilities

use crate::logger;
use crate::window_config::WindowConfig;

/// Window management utilities
pub struct WindowManager;

impl WindowManager {
    /// Toggle window visibility
    #[inline]
    pub fn toggle(window: &tauri::WebviewWindow) -> Result<(), String> {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;

        if is_visible {
            window.hide().map_err(|e| {
                logger::error("Window", &format!("Failed to hide window: {}", e));
                e.to_string()
            })?;
            logger::info("Window", "Window hidden");
        } else {
            window.show().map_err(|e| {
                logger::error("Window", &format!("Failed to show window: {}", e));
                e.to_string()
            })?;
            window.set_focus().ok();
            logger::info("Window", "Window shown and focused");
        }
        Ok(())
    }

    /// Start dragging the window
    #[inline]
    pub fn start_dragging(window: &tauri::WebviewWindow) -> Result<(), String> {
        window.start_dragging().map_err(|e| {
            logger::error("Window", &format!("Failed to start dragging: {}", e));
            e.to_string()
        })?;
        Ok(())
    }

    /// Resize the window to specified dimensions
    #[inline]
    pub fn resize_window(window: &tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
        let size = tauri::Size::Physical(tauri::PhysicalSize::new(width, height));
        window.set_size(size).map_err(|e| e.to_string())?;
        logger::debug("Window", &format!("Window resized to {}x{}", width, height));
        Ok(())
    }
}

/// Save current window position and size
#[tauri::command]
pub async fn save_window_state(
    window: tauri::WebviewWindow,
) -> Result<(), String> {
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

/// Set up window behavior (hide on blur, skip taskbar, etc.)
#[inline]
pub fn setup_window_behavior(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        // Hide window when it loses focus
        let win_clone = window.clone();
        let _ = window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if !focused {
                    let _ = win_clone.hide();
                }
            }
        });

        // Save window position and size on move/resize events
        let win_clone2 = window.clone();
        let _ = window.on_window_event(move |event| {
            match event {
                tauri::WindowEvent::Moved(position) => {
                    // Get current size and save complete config
                    if let Ok(size) = win_clone2.outer_size() {
                        let config = WindowConfig {
                            x: position.x,
                            y: position.y,
                            width: size.width,
                            height: size.height,
                        };
                        let _ = crate::window_config::save_window_config(&config);
                    }
                }
                tauri::WindowEvent::Resized(size) => {
                    // Get current position and save complete config
                    if let Ok(position) = win_clone2.outer_position() {
                        let config = WindowConfig {
                            x: position.x,
                            y: position.y,
                            width: size.width,
                            height: size.height,
                        };
                        let _ = crate::window_config::save_window_config(&config);
                    }
                }
                _ => {}
            }
        });

        let _ = window.set_skip_taskbar(true);
        logger::info("Window", "Window behavior configured (hide on blur, skip taskbar)");
    }
    Ok(())
}

/// Set up window transparency (macOS only)
#[inline]
pub fn setup_window_transparency(app: &tauri::App) {
    use tauri::Manager;
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("document.body.style.backgroundColor = 'transparent';");
            let _ = window.eval("document.documentElement.style.backgroundColor = 'transparent';");
            logger::info("Window", "Transparent window enabled (macOS)");
        }
    }
}
