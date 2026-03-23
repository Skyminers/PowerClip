//! Hotkey module - Global hotkey registration and event handling

use std::sync::atomic::{AtomicU32, Ordering};

use global_hotkey::hotkey::{Code, HotKey, Modifiers};
use global_hotkey::GlobalHotKeyEvent;
use global_hotkey::GlobalHotKeyManager;
use global_hotkey::HotKeyState;

use tauri::{Emitter, Manager};

use crate::logger;

/// Hotkey state managed by Tauri.
pub struct HotkeyState {
    pub manager: std::sync::Mutex<GlobalHotKeyManager>,
    pub current_hotkey: std::sync::Mutex<Option<HotKey>>,
    pub add_to_snippets_hotkey: std::sync::Mutex<Option<HotKey>>,
    pub handler_installed: std::sync::Mutex<bool>,
}

// SAFETY: GlobalHotKeyManager on Windows contains *mut c_void (a Win32 HWND/handle)
// which does not auto-implement Send. However, Win32 handles are safe to transfer
// between threads, and all access to GlobalHotKeyManager is protected by a Mutex,
// so it is safe to implement Send + Sync manually here.
unsafe impl Send for HotkeyState {}
unsafe impl Sync for HotkeyState {}

impl HotkeyState {
    pub fn new() -> Result<Self, String> {
        let manager = GlobalHotKeyManager::new().map_err(|e: global_hotkey::Error| {
            logger::error("Hotkey", &format!("Failed to create hotkey manager: {}", e));
            e.to_string()
        })?;
        Ok(Self {
            manager: std::sync::Mutex::new(manager),
            current_hotkey: std::sync::Mutex::new(None),
            add_to_snippets_hotkey: std::sync::Mutex::new(None),
            handler_installed: std::sync::Mutex::new(false),
        })
    }
}

/// Parse modifiers string (e.g. "Control+Shift") into Modifiers flags.
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

/// Parse key code string (e.g. "KeyV" or "V") into Code.
fn parse_key_code(key: &str) -> Option<Code> {
    match key.to_uppercase().as_str() {
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
        "ARROWUP" | "UP" => Some(Code::ArrowUp),
        "ARROWDOWN" | "DOWN" => Some(Code::ArrowDown),
        "ARROWLEFT" | "LEFT" => Some(Code::ArrowLeft),
        "ARROWRIGHT" | "RIGHT" => Some(Code::ArrowRight),
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

/// Active hotkey IDs for the global event handler.
static ACTIVE_HOTKEY_ID: AtomicU32 = AtomicU32::new(0);
static ADD_TO_SNIPPETS_HOTKEY_ID: AtomicU32 = AtomicU32::new(0);

/// Register a global hotkey with the given modifier and key settings.
///
/// Automatically unregisters any previously active hotkey. Installs the
/// global event handler on the first call.
pub fn register_hotkey_with_settings(
    manager: &GlobalHotKeyManager,
    current_hotkey: &std::sync::Mutex<Option<HotKey>>,
    handler_installed: &std::sync::Mutex<bool>,
    window: &tauri::WebviewWindow,
    modifiers: &str,
    key: &str,
) -> Result<(), String> {
    let parsed_modifiers = parse_modifiers(modifiers);
    let key_code = parse_key_code(key).ok_or_else(|| format!("Invalid key code: {}", key))?;
    let hotkey = HotKey::new(Some(parsed_modifiers), key_code);

    logger::info(
        "Hotkey",
        &format!("Registering main hotkey: {}+{}", modifiers, key),
    );

    let mut guard = current_hotkey.lock().map_err(|e| e.to_string())?;

    if let Some(old_hotkey) = guard.take() {
        if let Err(e) = manager.unregister(old_hotkey) {
            logger::error("Hotkey", &format!("Failed to unregister old hotkey: {}", e));
        }
    }

    manager
        .register(hotkey)
        .map_err(|e: global_hotkey::Error| {
            logger::error("Hotkey", &format!("Failed to register hotkey: {}", e));
            e.to_string()
        })?;

    *guard = Some(hotkey);
    drop(guard);

    ACTIVE_HOTKEY_ID.store(hotkey.id(), Ordering::SeqCst);

    let mut installed = handler_installed.lock().map_err(|e| e.to_string())?;
    if !*installed {
        let win = window.clone();
        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            let main_id = ACTIVE_HOTKEY_ID.load(Ordering::SeqCst);
            let snippets_id = ADD_TO_SNIPPETS_HOTKEY_ID.load(Ordering::SeqCst);

            logger::debug(
                "Hotkey",
                &format!(
                    "Event received: id={}, main_id={}, snippets_id={}, state={:?}",
                    event.id, main_id, snippets_id, event.state
                ),
            );

            if event.state == HotKeyState::Pressed {
                if event.id == main_id {
                    logger::info("Hotkey", "Main hotkey triggered, toggling window");
                    let app_handle = win.app_handle();
                    // Toggle: hide if visible, show if hidden
                    if win.is_visible().unwrap_or(false) {
                        let _ = crate::window::hide(&win);
                    } else {
                        let _ = crate::window::show_and_notify(app_handle, &win);
                    }
                } else if event.id == snippets_id {
                    logger::info("Hotkey", "Add to snippets hotkey triggered");
                    let app_handle = win.app_handle();
                    // Read clipboard in backend so it works even when the window is hidden
                    if let Some(crate::clipboard::ClipboardContent::Text(text)) = crate::clipboard::get_clipboard_content() {
                        let _ = app_handle.emit("powerclip:add-to-snippets-hotkey", text);
                    } else {
                        logger::info("Hotkey", "No text content in clipboard, skipping add-to-snippets");
                    }
                }
            }
        }));
        *installed = true;
    }

    Ok(())
}

/// Register the "add to snippets" hotkey.
pub fn register_add_to_snippets_hotkey(
    manager: &GlobalHotKeyManager,
    add_to_snippets_hotkey: &std::sync::Mutex<Option<HotKey>>,
    enabled: bool,
    modifiers: &str,
    key: &str,
) -> Result<(), String> {
    let mut guard = add_to_snippets_hotkey.lock().map_err(|e| e.to_string())?;

    // Unregister old hotkey if exists
    if let Some(old_hotkey) = guard.take() {
        if let Err(e) = manager.unregister(old_hotkey) {
            logger::error(
                "Hotkey",
                &format!("Failed to unregister old add-to-snippets hotkey: {}", e),
            );
        }
    }

    if !enabled {
        logger::info("Hotkey", "Add to snippets hotkey disabled");
        ADD_TO_SNIPPETS_HOTKEY_ID.store(0, Ordering::SeqCst);
        return Ok(());
    }

    let parsed_modifiers = parse_modifiers(modifiers);
    let key_code = parse_key_code(key).ok_or_else(|| format!("Invalid key code: {}", key))?;
    let hotkey = HotKey::new(Some(parsed_modifiers), key_code);

    logger::info(
        "Hotkey",
        &format!("Registering add-to-snippets hotkey: {}+{}", modifiers, key),
    );

    manager
        .register(hotkey)
        .map_err(|e: global_hotkey::Error| {
            logger::error(
                "Hotkey",
                &format!("Failed to register add-to-snippets hotkey: {}", e),
            );
            e.to_string()
        })?;

    *guard = Some(hotkey);
    ADD_TO_SNIPPETS_HOTKEY_ID.store(hotkey.id(), Ordering::SeqCst);

    Ok(())
}
