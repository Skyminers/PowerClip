//! Hotkey module - Global hotkey management

use std::sync::atomic::{AtomicU32, Ordering};

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
    pub current_hotkey: std::sync::Mutex<Option<HotKey>>,
    pub handler_installed: std::sync::Mutex<bool>,
}

impl HotkeyState {
    pub fn new() -> Result<Self, String> {
        let manager = GlobalHotKeyManager::new().map_err(|e: global_hotkey::Error| {
            logger::error("Hotkey", &format!("Failed to create hotkey manager: {}", e));
            e.to_string()
        })?;
        Ok(Self {
            manager: std::sync::Mutex::new(manager),
            current_hotkey: std::sync::Mutex::new(None),
            handler_installed: std::sync::Mutex::new(false),
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
    // Handle common key names - match both "KeyA" and "A" formats
    match key.to_uppercase().as_str() {
        // Letters A-Z
        "KEYA" | "A" => Some(Code::KeyA),
        "KEYB" | "B" => Some(Code::KeyB),
        "KEYC" | "C" => Some(Code::KeyC),
        "KEYD" | "D" => Some(Code::KeyD),
        "KEYE" | "E" => Some(Code::KeyE),
        "KEYF" | "F" => Some(Code::KeyF),
        "KEYG" | "G" => Some(Code::KeyG),
        "KEYH" | "H" => Some(Code::KeyH),
        "KEYI" | "I" => Some(Code::KeyI),
        "KEYJ" | "J" => Some(Code::KeyJ),
        "KEYK" | "K" => Some(Code::KeyK),
        "KEYL" | "L" => Some(Code::KeyL),
        "KEYM" | "M" => Some(Code::KeyM),
        "KEYN" | "N" => Some(Code::KeyN),
        "KEYO" | "O" => Some(Code::KeyO),
        "KEYP" | "P" => Some(Code::KeyP),
        "KEYQ" | "Q" => Some(Code::KeyQ),
        "KEYR" | "R" => Some(Code::KeyR),
        "KEYS" | "S" => Some(Code::KeyS),
        "KEYT" | "T" => Some(Code::KeyT),
        "KEYU" | "U" => Some(Code::KeyU),
        "KEYV" | "V" => Some(Code::KeyV),
        "KEYW" | "W" => Some(Code::KeyW),
        "KEYX" | "X" => Some(Code::KeyX),
        "KEYY" | "Y" => Some(Code::KeyY),
        "KEYZ" | "Z" => Some(Code::KeyZ),
        // Numbers 0-9
        "DIGIT0" | "0" => Some(Code::Digit0),
        "DIGIT1" | "1" => Some(Code::Digit1),
        "DIGIT2" | "2" => Some(Code::Digit2),
        "DIGIT3" | "3" => Some(Code::Digit3),
        "DIGIT4" | "4" => Some(Code::Digit4),
        "DIGIT5" | "5" => Some(Code::Digit5),
        "DIGIT6" | "6" => Some(Code::Digit6),
        "DIGIT7" | "7" => Some(Code::Digit7),
        "DIGIT8" | "8" => Some(Code::Digit8),
        "DIGIT9" | "9" => Some(Code::Digit9),
        // Special keys
        "SPACE" => Some(Code::Space),
        "ENTER" | "RETURN" => Some(Code::Enter),
        "TAB" => Some(Code::Tab),
        "ESCAPE" | "ESC" => Some(Code::Escape),
        "BACKSPACE" => Some(Code::Backspace),
        "DELETE" => Some(Code::Delete),
        "INSERT" => Some(Code::Insert),
        "HOME" => Some(Code::Home),
        "END" => Some(Code::End),
        "PAGEUP" => Some(Code::PageUp),
        "PAGEDOWN" => Some(Code::PageDown),
        // Arrow keys
        "ARROWUP" | "UP" => Some(Code::ArrowUp),
        "ARROWDOWN" | "DOWN" => Some(Code::ArrowDown),
        "ARROWLEFT" | "LEFT" => Some(Code::ArrowLeft),
        "ARROWRIGHT" | "RIGHT" => Some(Code::ArrowRight),
        // Function keys
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        // Punctuation
        "MINUS" | "-" => Some(Code::Minus),
        "EQUAL" | "=" => Some(Code::Equal),
        "BRACKETLEFT" | "[" => Some(Code::BracketLeft),
        "BRACKETRIGHT" | "]" => Some(Code::BracketRight),
        "BACKSLASH" | "\\" => Some(Code::Backslash),
        "SEMICOLON" | ";" => Some(Code::Semicolon),
        "QUOTE" | "'" => Some(Code::Quote),
        "COMMA" | "," => Some(Code::Comma),
        "PERIOD" | "." => Some(Code::Period),
        "SLASH" | "/" => Some(Code::Slash),
        _ => None,
    }
}

/// 用 AtomicU32 存储当前活跃的 hotkey ID，避免闭包捕获问题
static ACTIVE_HOTKEY_ID: AtomicU32 = AtomicU32::new(0);

pub fn register_hotkey_with_settings(
    manager: &GlobalHotKeyManager,
    current_hotkey: &std::sync::Mutex<Option<HotKey>>,
    handler_installed: &std::sync::Mutex<bool>,
    window: &tauri::WebviewWindow,
    modifiers: &str,
    key: &str,
) -> Result<(), String> {
    let modifiers_parsed = parse_modifiers(modifiers);
    let key_code = parse_key_code(key).ok_or_else(|| format!("Invalid key code: {}", key))?;
    let hotkey = HotKey::new(Some(modifiers_parsed), key_code);

    logger::info(
        "Hotkey",
        &format!(
            "Registering hotkey: modifiers={}, key={}, id={}",
            modifiers, key, hotkey.id()
        ),
    );

    // 在同一个锁内完成 unregister → register
    let mut guard = current_hotkey.lock().map_err(|e| {
        logger::error("Hotkey", &format!("Failed to lock hotkey state: {}", e));
        e.to_string()
    })?;

    // 反注册旧热键
    if let Some(old_hotkey) = guard.take() {
        logger::info(
            "Hotkey",
            &format!("Unregistering old hotkey, id={}", old_hotkey.id()),
        );
        if let Err(e) = manager.unregister(old_hotkey) {
            logger::error(
                "Hotkey",
                &format!("Failed to unregister old hotkey: {}", e),
            );
        }
    }

    // 注册新热键
    manager.register(hotkey).map_err(|e: global_hotkey::Error| {
        logger::error("Hotkey", &format!("Failed to register hotkey: {}", e));
        e.to_string()
    })?;

    // 注册成功后才保存
    *guard = Some(hotkey);
    drop(guard);

    // 原子更新当前活跃的 hotkey ID
    ACTIVE_HOTKEY_ID.store(hotkey.id(), Ordering::SeqCst);
    logger::info(
        "Hotkey",
        &format!("ACTIVE_HOTKEY_ID set to {}", hotkey.id()),
    );

    let mut installed = handler_installed.lock().map_err(|e| e.to_string())?;
    if !*installed {
        logger::info("Hotkey", "Installing global event handler (first time)");
        let win = window.clone();
        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            let active_id = ACTIVE_HOTKEY_ID.load(Ordering::SeqCst);
            logger::info(
                "Hotkey",
                &format!(
                    "Event received: event_id={}, active_id={}, state={:?}",
                    event.id, active_id, event.state
                ),
            );
            if event.id == active_id && event.state == HotKeyState::Released {
                let app_handle = win.app_handle();
                let _ = WindowManager::show_and_notify(&app_handle, &win);
            }
        }));
        *installed = true;
    }

    logger::info("Hotkey", "Hotkey registration complete");
    Ok(())
}