//! Window module - Window management utilities

use crate::logger;

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

    /// Show window
    #[inline]
    pub fn show(window: &tauri::WebviewWindow) -> Result<(), String> {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().ok();
        logger::info("Window", "Window shown");
        Ok(())
    }

    /// Hide window
    #[inline]
    pub fn hide(window: &tauri::WebviewWindow) -> Result<(), String> {
        window.hide().map_err(|e| e.to_string())?;
        logger::info("Window", "Window hidden");
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

/// Set up window behavior (hide on blur, skip taskbar, etc.)
#[inline]
pub fn setup_window_behavior(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let win_clone = window.clone();
        let _ = window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                if !focused {
                    let _ = win_clone.hide();
                }
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
