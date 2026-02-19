#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

pub mod logger;
mod clipboard;
mod commands;
mod config;
mod db;
mod hotkey;
mod monitor;
mod window;
mod window_config;
mod app_settings;

pub use db::DatabaseState;
pub use hotkey::HotkeyState;

use std::sync::{Arc, Mutex};

use tauri::{
    image::Image as TauriImage,
    tray::TrayIconBuilder,
    menu::MenuBuilder,
    Manager,
    Size, PhysicalSize,
    Position, PhysicalPosition,
};

use crate::config::{data_dir, APP_NAME};

/// Tracks whether the settings dialog is open (prevents hide-on-blur).
#[derive(Clone)]
pub struct AppState {
    pub settings_open: Arc<Mutex<bool>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            settings_open: Arc::new(Mutex::new(false)),
        }
    }
}

/// Initialize system tray.
fn setup_tray(app: &tauri::App) -> Result<(), String> {
    let icon_data = include_bytes!("../icons/icon.png");
    let icon = TauriImage::from_bytes(icon_data).map_err(|e| e.to_string())?;

    let tray_menu = MenuBuilder::new(app)
        .text("show", "显示窗口")
        .separator()
        .text("quit", "退出")
        .build()
        .map_err(|e| e.to_string())?;

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
                "quit" => std::process::exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    use tauri::Emitter;
                    let _ = tray.app_handle().emit_to("main", "powerclip:window-shown", ());
                }
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Initialize application state, database, hotkey, tray, and window.
fn initialize_app(app: &tauri::App) -> Result<(), String> {
    config::ensure_dirs();

    // Database
    let conn = DatabaseState::new(data_dir()).map_err(|e| e.to_string())?;
    app.manage(conn);

    // App state
    app.manage(AppState::default());

    // Hotkey manager
    let hotkey_state = HotkeyState::new()?;
    app.manage(hotkey_state);

    // System tray
    setup_tray(app)?;

    // Clipboard monitor event listener
    {
        use tauri::Listener;
        let app_handle = app.handle().clone();
        let _ = app_handle.clone().listen("powerclip:check-clipboard", move |_event| {
            let app = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = commands::history::check_clipboard(app).await;
            });
        });
    }

    // Start clipboard polling
    monitor::start_clipboard_monitor(app.handle().clone());

    // Restore window geometry
    let window = app.get_webview_window("main").unwrap();
    if let Ok(config) = window_config::load_window_config() {
        let _ = window.set_size(Size::Physical(PhysicalSize::new(config.width, config.height)));
        let _ = window.set_position(Position::Physical(PhysicalPosition::new(config.x, config.y)));
    }

    // Register hotkey from saved settings
    let state = app.state::<HotkeyState>();
    let guard = state.manager.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
    let settings = app_settings::load_settings().unwrap_or_default();
    hotkey::register_hotkey_with_settings(
        &guard,
        &state.current_hotkey,
        &state.handler_installed,
        &window,
        &settings.hotkey_modifiers,
        &settings.hotkey_key,
    )?;
    drop(guard);

    // Window behavior
    window::setup_window_behavior(app)?;
    window::setup_window_transparency(app)?;

    logger::info("Main", "Initialization complete");
    Ok(())
}

#[tokio::main(flavor = "current_thread")]
async fn main() {
    logger::info("Main", &format!("=== {} Starting ===", APP_NAME));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            initialize_app(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::history::get_history,
            commands::history::copy_to_clipboard,
            commands::history::check_clipboard,
            commands::image::get_image_asset_url,
            commands::paste::simulate_paste,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::set_settings_dialog_open,
            window::commands::save_window_state,
            window::commands::get_window_state,
            window::commands::move_window,
            window::commands::resize_window,
            window::commands::hide_window,
            commands::extensions::run_extension,
        ])
        .run(tauri::generate_context!())
        .expect("Fatal error while running tauri application");
}
