#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use rusqlite::Connection;
use chrono::Local;
use serde::Serialize;
use global_hotkey::GlobalHotKeyManager;
use tauri::{
    AppHandle, Manager, State,
    image::Image,
    tray::TrayIconBuilder,
    menu::MenuBuilder,
};

// ============== Logging System ==============
use std::sync::OnceLock;
use std::fs::OpenOptions;
use std::io::Write;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

impl LogLevel {
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warning => "WARNING",
            LogLevel::Error => "ERROR",
        }
    }
}

pub struct Logger {
    level: LogLevel,
    file: Mutex<std::fs::File>,
}

impl Logger {
    fn global() -> &'static Mutex<Logger> {
        static LOGGER: OnceLock<Mutex<Logger>> = OnceLock::new();
        LOGGER.get_or_init(|| {
            let data_dir = dirs::data_dir()
                .unwrap_or(PathBuf::from("."))
                .join("PowerClip");
            let log_file = data_dir.join("powerclip.log");

            // Create log directory if not exists
            let _ = fs::create_dir_all(&data_dir);

            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .write(true)
                .open(&log_file)
                .expect("Failed to open log file");

            Mutex::new(Logger {
                level: if cfg!(debug_assertions) {
                    LogLevel::Debug
                } else {
                    LogLevel::Info
                },
                file: Mutex::new(file),
            })
        })
    }

    fn log(&self, level: LogLevel, module: &str, message: &str) {
        if (level as u8) < (self.level as u8) {
            return;
        }

        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let thread_id = format!("{:?}", std::thread::current().id());
        let log_line = format!(
            "[{}] [{}] [{}] [Thread-{}] {}\n",
            timestamp,
            level.as_str(),
            module,
            thread_id,
            message
        );

        let mut file = self.file.lock().unwrap();
        let _ = file.write_all(log_line.as_bytes());
        let _ = file.flush();
    }

    pub fn debug(module: &str, message: &str) {
        Self::global().lock().unwrap().log(LogLevel::Debug, module, message);
    }

    pub fn info(module: &str, message: &str) {
        Self::global().lock().unwrap().log(LogLevel::Info, module, message);
    }

    pub fn warning(module: &str, message: &str) {
        Self::global().lock().unwrap().log(LogLevel::Warning, module, message);
    }

    pub fn error(module: &str, message: &str) {
        Self::global().lock().unwrap().log(LogLevel::Error, module, message);
    }
}

// ============== Constants ==============
const APP_NAME: &str = "PowerClip";
const HISTORY_LIMIT: i64 = 1000;
const CLIPBOARD_POLL_INTERVAL_MS: u64 = 500;
const IMAGE_FOLDER: &str = "images";
const ITEM_TYPE_TEXT: &str = "text";
const ITEM_TYPE_IMAGE: &str = "image";

// ============== Types ==============
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: String,
    pub content: String,
    pub hash: String,
    pub created_at: String,
}

#[derive(Debug)]
pub struct DatabaseState {
    conn: Mutex<Connection>,
}

pub struct HotkeyState {
    _manager: Mutex<global_hotkey::GlobalHotKeyManager>,
}

#[derive(Debug)]
enum ClipboardContent {
    Text(String),
    Image(Vec<u8>, String),
}

// ============== Database Operations ==============
fn init_database(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let db_path = data_dir.join("clipboard.db");
    let conn = Connection::open(&db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        (),
    )?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON history(created_at)", ())?;

    Logger::info("Database", &format!("Database initialized at {:?}", db_path));
    Ok(conn)
}

#[tauri::command]
fn get_history(state: State<DatabaseState>, limit: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, type, content, hash, created_at FROM history ORDER BY created_at DESC LIMIT ?"
    ).map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in stmt.query_map([limit], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            item_type: row.get(1)?,
            content: row.get(2)?,
            hash: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| e.to_string())? {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Logger::debug("Database", &format!("Retrieved {} history items", items.len()));
    Ok(items)
}

fn save_to_history(
    conn: &Connection,
    item_type: &str,
    content: &str,
    hash: &str,
) -> Result<(), rusqlite::Error> {
    let created_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Check if already exists
    let existing_id: Option<i64> = conn.query_row(
        "SELECT id FROM history WHERE hash = ?",
        [hash],
        |row| row.get(0)
    ).ok();

    match existing_id {
        Some(id) => {
            conn.execute(
                "UPDATE history SET created_at = ? WHERE id = ?",
                [&created_at, &id.to_string()],
            )?;
            Logger::debug("Database", &format!("Updated existing item id={}", id));
        }
        None => {
            conn.execute(
                "INSERT INTO history (type, content, hash, created_at) VALUES (?, ?, ?, ?)",
                (item_type, content, hash, &created_at),
            )?;
            Logger::debug("Database", &format!("Inserted new item hash={}", hash));
        }
    }

    // Cleanup old records
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY created_at DESC LIMIT ?)",
        [HISTORY_LIMIT],
    )?;

    Ok(())
}

fn calculate_hash(content: &[u8]) -> String {
    let digest = md5::compute(content);
    format!("{:x}", digest)
}

// ============== Clipboard Operations ==============
#[cfg(target_os = "macos")]
fn get_clipboard_content() -> Option<ClipboardContent> {
    use std::process::Command;

    // Check for image first
    let check_output = Command::new("osascript")
        .args(["-e", "
            try
                set the clipboard to (the clipboard as TIFF picture)
                return \"HAS_IMAGE\"
            on error
                try
                    set theText to (the clipboard as text)
                    return theText
                on error
                    return \"EMPTY\"
                end try
            end try
        "])
        .output()
        .ok()?;

    if !check_output.status.success() {
        Logger::warning("Clipboard", "osascript check command failed");
        return None;
    }

    let result = String::from_utf8_lossy(&check_output.stdout).into_owned();
    let trimmed = result.trim();

    if trimmed == "HAS_IMAGE" {
        Logger::debug("Clipboard", "Detected image in clipboard");
        // Get image as base64
        let img_output = Command::new("osascript")
            .args(["-e", "
                try
                    set theImage to the clipboard as «class PNGf»
                    return do shell script \"base64 -e <<'EOF'\" & theImage & \"EOF\"
                on error errStr
                    return \"ERROR:\" & errStr
                end try
            "])
            .output()
            .ok()?;

        if img_output.status.success() {
            let base64 = String::from_utf8_lossy(&img_output.stdout).into_owned();
            if !base64.starts_with("ERROR:") {
                match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, base64.trim()) {
                    Ok(data) => {
                        Logger::info("Clipboard", &format!("Image captured, size={} bytes", data.len()));
                        return Some(ClipboardContent::Image(data, "png".to_string()));
                    }
                    Err(e) => {
                        Logger::warning("Clipboard", &format!("Failed to decode base64 image: {}", e));
                    }
                }
            } else {
                Logger::warning("Clipboard", &format!("Image decoding failed: {}", base64));
            }
        } else {
            Logger::warning("Clipboard", "Image extraction command failed");
        }
    } else if trimmed != "EMPTY" && !trimmed.is_empty() {
        Logger::debug("Clipboard", &format!("Text content detected, length={}", trimmed.len()));
        return Some(ClipboardContent::Text(trimmed.to_string()));
    }

    None
}

#[cfg(target_os = "linux")]
fn get_clipboard_content() -> Option<ClipboardContent> {
    use std::process::Command;

    // Try to get image first
    let output = Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "image/png", "-o"])
        .output()
        .ok()?;

    if output.status.success() && !output.stdout.is_empty() {
        Logger::debug("Clipboard", &format!("Image detected from xclip, size={}", output.stdout.len()));
        return Some(ClipboardContent::Image(output.stdout, "png".to_string()));
    }

    // Try text
    let text_output = Command::new("xclip")
        .args(["-selection", "clipboard", "-o"])
        .output()
        .ok()?;

    if text_output.status.success() {
        if let Ok(content) = String::from_utf8(text_output.stdout) {
            if !content.is_empty() {
                Logger::debug("Clipboard", &format!("Text content detected, length={}", content.len()));
                return Some(ClipboardContent::Text(content));
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn get_clipboard_content() -> Option<ClipboardContent> {
    use std::process::Command;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", r#"
            Add-Type -AssemblyName PresentationCore
            if ([Windows.ApplicationModel.DataTransfer.Clipboard]::ContainsImage()) {
                $img = [Windows.ApplicationModel.DataTransfer.Clipboard]::GetImage()
                $stream = New-Object System.IO.MemoryStream
                $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
                $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($img))
                $encoder.Save($stream)
                [Convert]::ToBase64String($stream.ToArray())
            } else {
                $text = Get-Clipboard -TextFormatType Text
                if ($text) { $text } else { "EMPTY" }
            }
        "#])
        .output()
        .ok()?;

    if !output.status.success() {
        Logger::warning("Clipboard", "PowerShell command failed");
        return None;
    }

    let result = String::from_utf8_lossy(&output.stdout).into_owned();
    let trimmed = result.trim();

    if trimmed == "EMPTY" {
        return None;
    }

    // Check if it's base64 image data
    match base64::Engine::decode(&base64::engine::general_purpose::STANDARD, trimmed) {
        Ok(data) => {
            Logger::debug("Clipboard", &format!("Image detected from Windows clipboard, size={}", data.len()));
            return Some(ClipboardContent::Image(data, "png".to_string()));
        }
        Err(_) => {
            if !trimmed.is_empty() {
                Logger::debug("Clipboard", &format!("Text content detected, length={}", trimmed.len()));
                return Some(ClipboardContent::Text(trimmed.to_string()));
            }
        }
    }

    None
}

// ============== Clipboard Monitor ==============
fn start_clipboard_monitor(app: AppHandle) {
    thread::spawn(move || {
        let mut last_hash = String::new();
        let data_dir = dirs::data_dir()
            .unwrap_or(PathBuf::from("."))
            .join(APP_NAME);
        let images_dir = data_dir.join(IMAGE_FOLDER);
        let _ = fs::create_dir_all(&images_dir);

        Logger::info("Monitor", "Clipboard monitor thread started");
        Logger::debug("Monitor", &format!("Images directory: {:?}", images_dir));

        loop {
            thread::sleep(Duration::from_millis(CLIPBOARD_POLL_INTERVAL_MS));

            if let Some(content) = get_clipboard_content() {
                let hash = match &content {
                    ClipboardContent::Text(text) => {
                        if text.contains('\0') {
                            Logger::warning("Monitor", "Ignoring content with null character");
                            continue;
                        }
                        calculate_hash(text.as_bytes())
                    }
                    ClipboardContent::Image(img_data, _) => calculate_hash(img_data),
                };

                if hash != last_hash {
                    last_hash = hash.clone();
                    Logger::info("Monitor", &format!("New content detected, hash={}", hash));

                    if let Some(state) = app.try_state::<DatabaseState>() {
                        if let Ok(conn) = state.conn.lock() {
                            match content {
                                ClipboardContent::Text(text) => {
                                    if let Err(e) = save_to_history(&conn, ITEM_TYPE_TEXT, &text, &hash) {
                                        Logger::error("Database", &format!("Failed to save text: {}", e));
                                    }
                                }
                                ClipboardContent::Image(img_data, ext) => {
                                    let filename = format!("{}.{}", hash, ext);
                                    let image_path = images_dir.join(&filename);

                                    if let Err(e) = fs::write(&image_path, &img_data) {
                                        Logger::error("FileSystem", &format!("Failed to save image: {}", e));
                                        continue;
                                    }

                                    Logger::info("FileSystem", &format!("Image saved: {:?}", image_path));

                                    let relative_path = format!("{}/{}", IMAGE_FOLDER, filename);
                                    if let Err(e) = save_to_history(&conn, ITEM_TYPE_IMAGE, &relative_path, &hash) {
                                        Logger::error("Database", &format!("Failed to save image record: {}", e));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

// ============== Tauri Commands ==============
#[tauri::command]
fn copy_to_clipboard(item: ClipboardItem, app: AppHandle) -> Result<(), String> {
    Logger::info("Command", &format!("copy_to_clipboard called for item id={}", item.id));

    let window = app.get_webview_window("main").ok_or("No main window".to_string())?;

    if item.item_type == ITEM_TYPE_IMAGE {
        let file_path = item.content.clone();
        Logger::debug("Command", &format!("Copying image, path={}", file_path));

        let js_code = format!(r#"
            (async () => {{
                try {{
                    const response = await fetch('asset://localhost/{file_path}');
                    const blob = await response.blob();
                    await navigator.clipboard.write([
                        new ClipboardItem({{ 'image/png': blob }})
                    ]);
                    console.log('Image copied to clipboard successfully');
                }} catch (e) {{
                    console.error('Failed to copy image:', e);
                }}
            }})();
        "#);
        window.eval(&js_code).map_err(|e| {
            Logger::error("Command", &format!("Failed to execute JS: {}", e));
            e.to_string()
        })?;
        Logger::info("Command", "Image copy initiated");
    } else {
        let content = item.content.clone();
        Logger::debug("Command", &format!("Copying text, length={}", content.len()));

        let json_content = serde_json::to_string(&content).map_err(|e| e.to_string())?;
        window.eval(&format!("navigator.clipboard.writeText({})", json_content))
            .map_err(|e| {
                Logger::error("Command", &format!("Failed to copy text: {}", e));
                e.to_string()
            })?;
        Logger::info("Command", "Text copied to clipboard");
    }
    Ok(())
}

#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;

        if is_visible {
            window.hide().map_err(|e| {
                Logger::error("Window", &format!("Failed to hide window: {}", e));
                e.to_string()
            })?;
            Logger::info("Window", "Window hidden");
        } else {
            window.show().map_err(|e| {
                Logger::error("Window", &format!("Failed to show window: {}", e));
                e.to_string()
            })?;
            window.set_focus().ok();
            Logger::info("Window", "Window shown and focused");
        }
    }
    Ok(())
}

#[tauri::command]
fn drag_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.start_dragging().map_err(|e| {
            Logger::error("Window", &format!("Failed to start dragging: {}", e));
            e.to_string()
        })?;
        Logger::debug("Window", "Window drag started");
    }
    Ok(())
}

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    let data_dir = dirs::data_dir()
        .unwrap_or(PathBuf::from("."))
        .join(APP_NAME);
    let path = data_dir.to_string_lossy().to_string();
    Logger::debug("Command", &format!("get_data_dir returned: {}", path));
    Ok(path)
}

#[tauri::command]
fn get_image_full_path(relative_path: String) -> Result<String, String> {
    let data_dir = dirs::data_dir()
        .unwrap_or(PathBuf::from("."))
        .join(APP_NAME);
    let full_path = data_dir.join(relative_path.clone());
    let path = full_path.to_string_lossy().to_string();
    Logger::debug("Command", &format!("get_image_full_path: {} -> {}", relative_path, path));
    Ok(path)
}

// ============== Window Management ==============
fn setup_window_behavior(app: &tauri::App) -> Result<(), String> {
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
        Logger::info("Window", "Window behavior configured (hide on blur, skip taskbar)");
    }
    Ok(())
}

fn setup_window_transparency(app: &tauri::App) {
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.eval("document.body.style.backgroundColor = 'transparent';");
            let _ = window.eval("document.documentElement.style.backgroundColor = 'transparent';");
            Logger::info("Window", "Transparent window enabled (macOS)");
        }
    }
}

fn register_hotkey(app: &tauri::App, window: &tauri::WebviewWindow) -> Result<(), String> {
    let hotkey_state = app.state::<HotkeyState>();
    let manager = hotkey_state._manager.lock().map_err(|e| e.to_string())?;
    let win = window.clone();

    #[cfg(target_os = "macos")]
    {
        use global_hotkey::hotkey::{Code, Modifiers, HotKey};
        use global_hotkey::{GlobalHotKeyEvent, HotKeyState};

        let hotkey = HotKey::new(Some(Modifiers::META | Modifiers::SHIFT), Code::KeyV);
        manager.register(hotkey).map_err(|e| {
            Logger::error("Hotkey", &format!("Failed to register Cmd+Shift+V: {}", e));
            e.to_string()
        })?;
        Logger::info("Hotkey", "Registered Cmd+Shift+V (macOS)");

        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            if event.id == hotkey.id() && event.state == HotKeyState::Released {
                Logger::info("Hotkey", "Cmd+Shift+V triggered");
                let is_visible = win.is_visible().unwrap_or(false);
                if is_visible {
                    let _ = win.hide();
                    Logger::info("Hotkey", "Window hidden");
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = win.eval("setTimeout(() => document.querySelector('ul')?.focus(), 100)");
                    Logger::info("Hotkey", "Window shown and focused");
                }
            }
        }));
    }

    #[cfg(not(target_os = "macos"))]
    {
        use global_hotkey::hotkey::{Code, Modifiers, HotKey};
        use global_hotkey::{GlobalHotKeyEvent, HotKeyState};

        let hotkey = HotKey::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV);
        manager.register(hotkey).map_err(|e| {
            Logger::error("Hotkey", &format!("Failed to register Ctrl+Shift+V: {}", e));
            e.to_string()
        })?;
        Logger::info("Hotkey", "Registered Ctrl+Shift+V (Windows/Linux)");

        GlobalHotKeyEvent::set_event_handler(Some(move |event: GlobalHotKeyEvent| {
            if event.id == hotkey.id() && event.state == HotKeyState::Released {
                Logger::info("Hotkey", "Ctrl+Shift+V triggered");
                let is_visible = win.is_visible().unwrap_or(false);
                if is_visible {
                    let _ = win.hide();
                    Logger::info("Hotkey", "Window hidden");
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                    let _ = win.eval("setTimeout(() => document.querySelector('ul')?.focus(), 100)");
                    Logger::info("Hotkey", "Window shown and focused");
                }
            }
        }));
    }

    Ok(())
}

fn setup_tray(app: &tauri::App) -> Result<(), String> {
    let icon_data = include_bytes!("../icons/icon.png");
    let icon = Image::from_bytes(icon_data).map_err(|e| {
        Logger::error("Tray", &format!("Failed to load tray icon: {}", e));
        e.to_string()
    })?;

    let tray_menu = MenuBuilder::new(app)
        .text("show", "显示窗口")
        .separator()
        .text("quit", "退出")
        .build()
        .map_err(|e| {
            Logger::error("Tray", &format!("Failed to build tray menu: {}", e));
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
                        Logger::info("Tray", "Show window menu item clicked");
                    }
                }
                "quit" => {
                    Logger::info("Tray", "Quit menu item clicked");
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
                    let _ = window.eval("setTimeout(() => document.querySelector('ul')?.focus(), 100)");
                    Logger::info("Tray", "Left click: window shown");
                }
            }
        })
        .build(app)
        .map_err(|e| {
            Logger::error("Tray", &format!("Failed to build tray icon: {}", e));
            e.to_string()
        })?;

    Logger::info("Tray", "System tray initialized");
    Ok(())
}

// ============== Main ==============
fn main() {
    // Initialize logging first
    Logger::info("Main", &format!("=== {} Application Starting ===", APP_NAME));
    Logger::info("Main", &format!("Build: {:?}", if cfg!(debug_assertions) { "Debug" } else { "Release" }));
    Logger::info("Main", &format!("Platform: {}", std::env::consts::OS));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = dirs::data_dir()
                .unwrap_or(PathBuf::from("."))
                .join(APP_NAME);
            fs::create_dir_all(&data_dir).ok();

            Logger::info("Main", &format!("Data directory: {:?}", data_dir));

            // Initialize database
            let conn = init_database(&data_dir).map_err(|e| {
                Logger::error("Main", &format!("Database initialization failed: {}", e));
                e
            })?;

            let state = DatabaseState {
                conn: Mutex::new(conn),
            };
            app.manage(state);

            // Initialize hotkey manager
            let manager = GlobalHotKeyManager::new().map_err(|e| {
                Logger::error("Main", &format!("Failed to create hotkey manager: {}", e));
                e.to_string()
            })?;
            let hotkey_state = HotkeyState {
                _manager: Mutex::new(manager),
            };
            app.manage(hotkey_state);

            // Setup system tray
            setup_tray(app)?;

            // Start clipboard monitor
            let app_handle = app.handle().clone();
            start_clipboard_monitor(app_handle.clone());

            // Setup window
            let window = app.get_webview_window("main").unwrap();
            register_hotkey(app, &window)?;
            setup_window_behavior(app)?;
            setup_window_transparency(app);

            Logger::info("Main", "Application initialization complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            copy_to_clipboard,
            toggle_window,
            drag_window,
            get_data_dir,
            get_image_full_path
        ])
        .run(tauri::generate_context!())
        .expect("Fatal error while running tauri application");
}
