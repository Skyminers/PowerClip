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