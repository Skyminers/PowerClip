//! Window module - Window management and setup

pub mod commands;
pub mod config;

#[cfg(target_os = "macos")]
pub mod macos;

use std::sync::Mutex;

use crate::logger;
use crate::window::config::WindowConfig;

static PREVIOUS_APP_BUNDLE_ID: Mutex<Option<String>> = Mutex::new(None);

/// Hide window and restore focus to the previously active application.
pub fn hide(window: &tauri::WebviewWindow) -> Result<(), String> {
    if !window.is_visible().map_err(|e| e.to_string())? {
        return Ok(());
    }

    let _ = window.set_focus();
    window.hide().map_err(|e| {
        logger::error("Window", &format!("Failed to hide window: {}", e));
        e.to_string()
    })?;

    #[cfg(target_os = "macos")]
    if let Ok(lock) = PREVIOUS_APP_BUNDLE_ID.lock() {
        if let Some(ref bundle_id) = *lock {
            macos::activate_app(bundle_id);
        }
    }

    Ok(())
}

/// Show window, focus it, and notify frontend.
pub fn show_and_notify(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if let Ok(mut lock) = PREVIOUS_APP_BUNDLE_ID.lock() {
        *lock = macos::get_frontmost_bundle_id();
    }

    window.show().map_err(|e| {
        logger::error("Window", &format!("Failed to show window: {}", e));
        e.to_string()
    })?;
    let _ = window.set_focus();

    use tauri::Emitter;
    let _ = app.emit_to("main", "powerclip:window-shown", ());

    Ok(())
}

/// Set up window behavior (hide on blur, persist geometry).
pub fn setup_window_behavior(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    // Hide window when it loses focus (unless settings dialog is open)
    let blur_window = window.clone();
    let app_handle = app.handle().clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            if let Some(state) = app_handle.try_state::<crate::AppState>() {
                if let Ok(settings_open) = state.settings_open.lock() {
                    if *settings_open {
                        return;
                    }
                }
            }
            let _ = blur_window.hide();
        }
    });

    // Save window geometry on move/resize
    let geometry_window = window.clone();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Moved(position) => {
                if let Ok(size) = geometry_window.outer_size() {
                    let config = WindowConfig {
                        x: position.x,
                        y: position.y,
                        width: size.width,
                        height: size.height,
                    };
                    let _ = crate::window::config::save_window_config(&config);
                }
            }
            tauri::WindowEvent::Resized(size) => {
                if let Ok(position) = geometry_window.outer_position() {
                    let config = WindowConfig {
                        x: position.x,
                        y: position.y,
                        width: size.width,
                        height: size.height,
                    };
                    let _ = crate::window::config::save_window_config(&config);
                }
            }
            _ => {}
        }
    });

    let _ = window.set_skip_taskbar(true);
    logger::info("Window", "Window behavior configured");

    Ok(())
}

/// Set up platform-specific window transparency.
pub fn setup_window_transparency(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    #[cfg(target_os = "macos")]
    {
        let _ = window.eval("document.body.style.backgroundColor = 'transparent';");
        let _ = window.eval("document.documentElement.style.backgroundColor = 'transparent';");
    }

    Ok(())
}
