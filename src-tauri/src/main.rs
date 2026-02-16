//! PowerClip - Clipboard Manager
//!
//! A modern clipboard manager built with Tauri 2.0.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Re-export modules for easier access
pub mod logger;
mod clipboard;
mod db;
mod hotkey;
mod window;
mod commands;
mod config;
mod window_config;
mod app_settings;

// Re-export types used by commands
pub use commands::ClipboardItem;
pub use commands::check_clipboard;
pub use db::DatabaseState;
pub use hotkey::HotkeyState;

use std::sync::{Arc, Mutex};

/// App state to track if settings dialog is open
#[derive(Clone)]
pub struct AppState {
    pub settings_open: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            settings_open: Arc::new(Mutex::new(false)),
        }
    }
}

// Monitor module - Clipboard monitoring
mod monitor;

use tauri::{
    image::Image as TauriImage,
    tray::TrayIconBuilder,
    menu::MenuBuilder,
    Manager,
    Size,
    PhysicalSize,
    Position,
    PhysicalPosition,
};

use crate::window::{setup_window_behavior, setup_window_transparency, save_window_state, get_window_state, move_window, resize_window};
use crate::config::{data_dir, APP_NAME};

/// Initialize system tray
#[inline]
fn setup_tray(app: &tauri::App) -> Result<(), String> {
    let icon_data = include_bytes!("../icons/icon.png");
    let icon = TauriImage::from_bytes(icon_data).map_err(|e| {
        crate::logger::error("Tray", &format!("Failed to load tray icon: {}", e));
        e.to_string()
    })?;

    let tray_menu = MenuBuilder::new(app)
        .text("show", "显示窗口")
        .separator()
        .text("quit", "退出")
        .build()
        .map_err(|e| {
            crate::logger::error("Tray", &format!("Failed to build tray menu: {}", e));
            e.to_string()
        })?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&tray_menu)
        .tooltip(format!("{} - Clipboard History", APP_NAME))
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        use tauri::Emitter;
                        let _ = app.emit_to("main", "powerclip:window-shown", ());
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    use tauri::Emitter;
                    let _ = tray.app_handle().emit_to("main", "powerclip:window-shown", ());
                }
            }
        })
        .build(app)
        .map_err(|e| {
            crate::logger::error("Tray", &format!("Failed to build tray icon: {}", e));
            e.to_string()
        })?;

    crate::logger::info("Tray", "System tray initialized");
    Ok(())
}

/// Initialize application
#[inline]
fn initialize_app(app: &tauri::App) -> Result<(), String> {
    // Ensure directories exist
    crate::config::ensure_dirs();

    crate::logger::info("Main", &format!("Data directory: {:?}", data_dir()));

    // Initialize database
    let conn = db::DatabaseState::new(data_dir()).map_err(|e| {
        crate::logger::error("Main", &format!("Database initialization failed: {}", e));
        e.to_string()
    })?;
    app.manage(conn);

    // Initialize app state
    let app_state = AppState::new();
    app.manage(app_state);

    // Initialize hotkey manager
    let hotkey_state = HotkeyState::new()?;
    app.manage(hotkey_state);

    // Setup system tray
    setup_tray(app)?;

    // Setup window event listener for clipboard monitoring
    {
        use tauri::Listener;
        let app_handle = app.handle().clone();
        let _ = app_handle.clone().listen("powerclip:check-clipboard", move |_event| {
            // Call check_clipboard command on the main thread
            let app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = check_clipboard(app).await;
            });
        });
    }

    // Start clipboard monitor
    let app_handle = app.handle().clone();
    monitor::start_clipboard_monitor(app_handle);

    // Setup window
    let window = app.get_webview_window("main").unwrap();

    // Apply saved window position and size
    if let Ok(config) = window_config::load_window_config() {
        let size = Size::Physical(PhysicalSize::new(config.width, config.height));
        let _ = window.set_size(size);
        let position = Position::Physical(PhysicalPosition::new(config.x, config.y));
        let _ = window.set_position(position);
        crate::logger::info("Main", &format!("Restored window: {}x{} at ({},{})", config.width, config.height, config.x, config.y));
    }

    let state = app.state::<HotkeyState>();
    let guard = state.manager.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    // Load settings and register hotkey
    let settings = app_settings::load_settings().unwrap_or_default();
    hotkey::register_hotkey_with_settings(
        &guard, 
        &state.current_hotkey,
        &state.handler_installed,
        &window,
        &settings.hotkey_modifiers, &settings.hotkey_key
    )?;

    drop(guard);
    setup_window_behavior(app)?;
    setup_window_transparency(app)?;

    crate::logger::info("Main", "Application initialization complete");
    Ok(())
}

/// Main entry point
#[tokio::main(flavor = "current_thread")]
async fn main() {
    // Initialize logging first
    crate::logger::info("Main", &format!("=== {} Application Starting ===", APP_NAME));
    crate::logger::info("Main", &format!("Build: {:?}", if cfg!(debug_assertions) { "Debug" } else { "Release" }));
    crate::logger::info("Main", &format!("Platform: {}", std::env::consts::OS));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            initialize_app(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_history,
            commands::copy_to_clipboard,
            commands::toggle_window,
            commands::hide_window,
            commands::show_and_focus_window,
            commands::drag_window,
            commands::get_data_dir,
            commands::get_image_full_path,
            commands::get_image_asset_url,
            commands::check_clipboard,
            commands::delete_item,
            commands::clear_history,
            commands::get_settings,
            commands::save_settings,
            commands::set_settings_dialog_open,
            save_window_state,
            get_window_state,
            move_window,
            resize_window,
        ])
        .run(tauri::generate_context!())
        .expect("Fatal error while running tauri application");
}
