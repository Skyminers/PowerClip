//! Window module - Window management utilities
//!
//! Provides window operations including window management utilities and commands.
pub mod commands;

use std::sync::Mutex;

use crate::logger;

/// Window management utilities
pub struct WindowManager;

static PREVIOUS_APP_BUNDLE_ID: Mutex<Option<String>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn activate_app(bundle_id: &str) {
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, class};

    unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
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
                let _: bool = msg_send![app, activateWithOptions: 1usize];
                return;
            }
        }
    }
}

impl WindowManager {
    /// Hide window and release focus
    #[inline]
    pub fn hide(window: &tauri::WebviewWindow) -> Result<(), String> {
        if window.is_visible().map_err(|e| e.to_string())? {
            // Release focus to other app before hiding
            let _ = window.set_focus();
            window.hide().map_err(|e| {
                logger::error("Window", &format!("Failed to hide window: {}", e));
                e.to_string()
            })?;
            logger::info("Window", "Window hidden");

            if let Ok(handle_lock) = PREVIOUS_APP_BUNDLE_ID.lock() {
                if let Some(ref handle_id) = *handle_lock {
                    activate_app(handle_id);
                }
            }
        }
        Ok(())
    }

    /// Show window, focus it, and notify frontend
    #[inline]
    pub fn show_and_notify(app: &tauri::AppHandle, window: &tauri::WebviewWindow) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            if let Ok(mut handle_id) = PREVIOUS_APP_BUNDLE_ID.lock() {
                *handle_id = get_frontmost_bundle_id();
            }
        }

        window.show().map_err(|e| {
            logger::error("Window", &format!("Failed to show window: {}", e));
            e.to_string()
        })?;
        let _ = window.set_focus();

        // Emit event to frontend
        use tauri::Emitter;
        let _ = app.emit_to("main", "powerclip:window-shown", ());
        logger::info("Window", "Window shown and frontend notified");

        Ok(())
    }
}


// ============================================================================
// Window Setup Functions
// ============================================================================

#[cfg(target_os = "macos")]
fn get_frontmost_bundle_id() -> Option<String> {
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, class};

    unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        let app: *mut AnyObject = msg_send![workspace, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let bundle_id: *mut AnyObject = msg_send![app, bundleIdentifier];
        if bundle_id.is_null() {
            return None;
        }
        let utf8: *const std::ffi::c_char = msg_send![bundle_id, UTF8String];
        if utf8.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }
}

use crate::window_config::WindowConfig;

/// Set up window behavior (hide on blur, skip taskbar, etc.)
#[inline]
pub fn setup_window_behavior(app: &tauri::App) -> Result<(), String> {
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    // Hide window when it loses focus (unless settings dialog is open)
    let win_clone = window.clone();
    let app_handle = app.handle().clone();
    let _ = window.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(focused) = event {
            if !focused {
                // Check if settings dialog is open
                if let Some(state) = app_handle.try_state::<crate::AppState>() {
                    if let Ok(settings_open) = state.settings_open.lock() {
                        if *settings_open {
                            // Don't hide window when settings dialog is open
                            logger::debug("Window", "Window lost focus but settings dialog is open, not hiding");
                            return;
                        }
                    }
                }
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
