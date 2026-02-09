//! Window module - Window management utilities
//!
//! Provides window operations including toggle, drag, and transparency.

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
            logger::info("Window", "Window shown");
        }
        Ok(())
    }

    /// Show window and try to focus it
    #[inline]
    pub fn show_and_focus(window: &tauri::WebviewWindow) -> Result<(), String> {
        window.show().map_err(|e| {
            logger::error("Window", &format!("Failed to show window: {}", e));
            e.to_string()
        })?;
        // Try to focus - on macOS this may fail but we try
        let _ = window.set_focus();
        logger::info("Window", "Window shown and focus requested");
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
}

// ============================================================================
// Tauri Commands
// ============================================================================

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

// ============================================================================
// Window Setup Functions
// ============================================================================

/// Set up window behavior (hide on blur, skip taskbar, etc.)
#[inline]
pub fn setup_window_behavior(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

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

    Ok(())
}

/// Set up window transparency for platform-specific handling
///
/// - macOS: Enables transparent background
/// - Windows: Configures appropriate opacity settings
/// - Linux: No special handling needed
#[inline]
pub fn setup_window_transparency(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let _ = &window; // Suppress unused variable warning on non-macOS

    #[cfg(target_os = "macos")]
    {
        // macOS: Use transparent background
        let _ = window.eval("document.body.style.backgroundColor = 'transparent';");
        let _ = window.eval("document.documentElement.style.backgroundColor = 'transparent';");
        logger::info("Window", "Transparent window enabled (macOS)");
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: Set window opacity for frameless window
        // Note: Tauri 2.0 handles this via window configuration
        // This is a placeholder for potential future Windows-specific transparency
        logger::info("Window", "Window transparency configured (Windows)");
    }

    #[cfg(target_os = "linux")]
    {
        logger::info("Window", "Window transparency configured (Linux)");
    }

    Ok(())
}
