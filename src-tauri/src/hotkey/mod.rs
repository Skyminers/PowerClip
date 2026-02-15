//! Hotkey module - Global hotkey management

use global_hotkey::GlobalHotKeyEvent;
use global_hotkey::GlobalHotKeyManager;
use global_hotkey::hotkey::{Code, Modifiers, HotKey};
use global_hotkey::HotKeyState;
use tauri::Manager;

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

/// Parse modifiers string to Modifiers
fn parse_modifiers(modifiers: &str) -> Modifiers {
    let mut result = Modifiers::empty();
    for part in modifiers.split('+') {
        match part.trim() {
            "Control" | "Ctrl" => result |= Modifiers::CONTROL,
            "Meta" | "Cmd" | "Super" => result |= Modifiers::META,
            "Shift" => result |= Modifiers::SHIFT,
            "Alt" => result |= Modifiers::ALT,
            _ => {}
        }
    }
    result
}

/// Parse key code string to Code
fn parse_key_code(key: &str) -> Option<Code> {
    // Handle common key names
    match key.to_uppercase().as_str() {
        "KEYA" => Some(Code::KeyA),
        "KEYB" => Some(Code::KeyB),
        "KEYC" => Some(Code::KeyC),
        "KEYD" => Some(Code::KeyD),
        "KEYE" => Some(Code::KeyE),
        "KEYF" => Some(Code::KeyF),
        "KEYG" => Some(Code::KeyG),
        "KEYH" => Some(Code::KeyH),
        "KEYI" => Some(Code::KeyI),
        "KEYJ" => Some(Code::KeyJ),
        "KEYK" => Some(Code::KeyK),
        "KEYL" => Some(Code::KeyL),
        "KEYM" => Some(Code::KeyM),
        "KEYN" => Some(Code::KeyN),
        "KEYO" => Some(Code::KeyO),
        "KEYP" => Some(Code::KeyP),
        "KEYQ" => Some(Code::KeyQ),
        "KEYR" => Some(Code::KeyR),
        "KEYS" => Some(Code::KeyS),
        "KEYT" => Some(Code::KeyT),
        "KEYU" => Some(Code::KeyU),
        "KEYV" => Some(Code::KeyV),
        "KEYW" => Some(Code::KeyW),
        "KEYX" => Some(Code::KeyX),
        "KEYY" => Some(Code::KeyY),
        "KEYZ" => Some(Code::KeyZ),
        "SPACE" => Some(Code::Space),
        "ENTER" | "RETURN" => Some(Code::Enter),
        "TAB" => Some(Code::Tab),
        "ESCAPE" | "ESC" => Some(Code::Escape),
        "BACKSPACE" => Some(Code::Backspace),
        "DELETE" => Some(Code::Delete),
        "ARROWUP" | "UP" => Some(Code::ArrowUp),
        "ARROWDOWN" | "DOWN" => Some(Code::ArrowDown),
        "ARROWLEFT" | "LEFT" => Some(Code::ArrowLeft),
        "ARROWRIGHT" | "RIGHT" => Some(Code::ArrowRight),
        _ => None,
    }
}

/// Register the show/hide hotkey with custom modifiers and key
#[inline]
pub fn register_hotkey_with_settings(
    manager: &GlobalHotKeyManager,
    window: &tauri::WebviewWindow,
    modifiers: &str,
    key: &str,
) -> Result<(), String> {
    let modifiers_parsed = parse_modifiers(modifiers);
    let key_code = parse_key_code(key).ok_or_else(|| format!("Invalid key code: {}", key))?;

    let hotkey = HotKey::new(Some(modifiers_parsed), key_code);

    logger::info("Hotkey", &format!("Registering hotkey: {}+{}", modifiers, key));

    manager.register(hotkey).map_err(|e: global_hotkey::Error| {
        logger::error("Hotkey", &format!("Failed to register hotkey: {}", e));
        e.to_string()
    })?;

    // Set up event handler
    let win = window.clone();
    GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
        if event.id == hotkey.id() && event.state == HotKeyState::Released {
            let app_handle = win.app_handle();
            let _ = WindowManager::show_and_notify(&app_handle, &win);
        }
    }));

    logger::info("Hotkey", &format!("Registered hotkey: {}+{}", modifiers, key));
    Ok(())
}

/// Register the default show/hide hotkey (Cmd+Shift+V on macOS, Ctrl+Shift+V on others)
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
            let app_handle = win.app_handle();
            let _ = WindowManager::show_and_notify(&app_handle, &win);
        }
    }));

    Ok(())
}
