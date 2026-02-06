//! Hotkey module - Global hotkey management

use global_hotkey::GlobalHotKeyEvent;
use global_hotkey::GlobalHotKeyManager;
use global_hotkey::hotkey::{Code, Modifiers, HotKey};
use global_hotkey::HotKeyState;

use crate::logger;
use crate::window::WindowManager;

/// Hotkey state managed by Tauri
pub struct HotkeyState {
    pub manager: std::sync::Mutex<GlobalHotKeyManager>,
}

impl HotkeyState {
    /// Create a new hotkey state
    pub fn new() -> Result<Self, String> {
        let manager = GlobalHotKeyManager::new().map_err(|e: global_hotkey::Error| {
            logger::error("Hotkey", &format!("Failed to create hotkey manager: {}", e));
            e.to_string()
        })?;
        Ok(Self {
            manager: std::sync::Mutex::new(manager),
        })
    }
}

/// Register the show/hide hotkey (Cmd+Shift+V on macOS, Ctrl+Shift+V on others)
#[inline]
pub fn register_hotkey(manager: &GlobalHotKeyManager, window: &tauri::WebviewWindow) -> Result<(), String> {
    cfg_if::cfg_if! {
        if #[cfg(target_os = "macos")] {
            let hotkey = HotKey::new(
                Some(Modifiers::META | Modifiers::SHIFT),
                Code::KeyV,
            );
            logger::info("Hotkey", "Registered Cmd+Shift+V (macOS)");
        } else {
            let hotkey = HotKey::new(
                Some(Modifiers::CONTROL | Modifiers::SHIFT),
                Code::KeyV,
            );
            logger::info("Hotkey", "Registered Ctrl+Shift+V (Windows/Linux)");
        }
    }

    manager.register(hotkey).map_err(|e: global_hotkey::Error| {
        logger::error("Hotkey", &format!("Failed to register hotkey: {}", e));
        e.to_string()
    })?;

    // Set up event handler
    let win = window.clone();
    GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
        if event.id == hotkey.id() && event.state == HotKeyState::Released {
            logger::info("Hotkey", "Show/hide hotkey triggered");
            let _ = WindowManager::toggle(&win);
        }
    }));

    Ok(())
}
