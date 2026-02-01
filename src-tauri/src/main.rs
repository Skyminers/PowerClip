#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use rusqlite::Connection;
use chrono::Local;
use serde::Serialize;
use tauri::{
    AppHandle, Manager, State,
    image::Image,
    tray::TrayIconBuilder,
    menu::MenuBuilder,
};

// 剪贴板内容类型
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

#[tauri::command]
fn get_history(state: State<DatabaseState>, limit: i64) -> Result<Vec<ClipboardItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT id, type, content, hash, created_at FROM history ORDER BY created_at DESC LIMIT ?").map_err(|e| e.to_string())?;
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
    Ok(items)
}

#[tauri::command]
fn copy_to_clipboard(item: ClipboardItem, app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("No main window".to_string())?;
    let content = item.content.clone();
    let json_content = serde_json::to_string(&content).map_err(|e| e.to_string())?;
    window.eval(&format!("navigator.clipboard.writeText({})", json_content)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().map_err(|e| e.to_string())?;
        if is_visible {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().ok();
        }
    }
    Ok(())
}

#[tauri::command]
fn drag_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

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

    Ok(conn)
}

fn calculate_hash(content: &str) -> String {
    let digest = md5::compute(content.as_bytes());
    format!("{:x}", digest)
}

fn get_clipboard_content() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("pbpaste").output().ok()?;
        if output.status.success() {
            let content = String::from_utf8(output.stdout).ok()?;
            if !content.is_empty() {
                return Some(content);
            }
        }
        None
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let output = Command::new("xclip").args(["-selection", "clipboard", "-o"]).output().ok()?;
        if output.status.success() {
            let content = String::from_utf8(output.stdout).ok()?;
            if !content.is_empty() {
                return Some(content);
            }
        }
        None
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("powershell")
            .args(["-Command", "Get-Clipboard"])
            .output()
            .ok()?;
        if output.status.success() {
            let content = String::from_utf8(output.stdout).ok()?;
            if !content.is_empty() {
                return Some(content.trim_end().to_string());
            }
        }
        None
    }
}

// macOS global hotkey monitoring using AppleScript
#[cfg(target_os = "macos")]
fn start_hotkey_monitor(app: AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};

    let running = Arc::new(AtomicBool::new(true));
    let app_clone = app.clone();

    thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            let output = std::process::Command::new("osascript")
                .args(["-e", "
                    tell application \"System Events\"
                        if (keys down {command, shift}) and (key code 9) then
                            return true
                        else
                            return false
                        end if
                    end tell
                "])
                .output();

            match output {
                Ok(result) => {
                    if result.status.success() {
                        let output_str = String::from_utf8_lossy(&result.stdout);
                        if output_str.trim() == "true" {
                            if let Some(window) = app_clone.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                if is_visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            thread::sleep(Duration::from_millis(500));
                        }
                    }
                }
                Err(_) => {}
            }
            thread::sleep(Duration::from_millis(50));
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn start_hotkey_monitor(app: AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    let running = Arc::new(AtomicBool::new(true));
    let app = app.clone();

    thread::spawn(move || {
        while running.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(50));
        }
    });
}

fn start_clipboard_monitor(app: AppHandle) {
    thread::spawn(move || {
        let mut last_hash = String::new();

        loop {
            thread::sleep(Duration::from_millis(500));

            if let Some(content) = get_clipboard_content() {
                let hash = calculate_hash(&content);
                if hash != last_hash && !content.contains('\0') {
                    last_hash = hash.clone();
                    let created_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

                    if let Some(state) = app.try_state::<DatabaseState>() {
                        if let Ok(conn) = state.conn.lock() {
                            let exists: Result<Option<i64>, rusqlite::Error> = conn.query_row(
                                "SELECT id FROM history WHERE hash = ?",
                                [&hash],
                                |row| row.get(0)
                            ).map(Some).or(Ok(None));

                            match exists {
                                Ok(Some(id)) => {
                                    let _ = conn.execute("UPDATE history SET created_at = ? WHERE id = ?", [&created_at, &id.to_string()]);
                                }
                                _ => {
                                    let item_type = if content.starts_with("data:image") || content.ends_with(".png") || content.ends_with(".jpg") {
                                        "image".to_string()
                                    } else {
                                        "text".to_string()
                                    };
                                    let _ = conn.execute(
                                        "INSERT INTO history (type, content, hash, created_at) VALUES (?, ?, ?, ?)",
                                        (&item_type, &content, &hash, &created_at),
                                    );
                                }
                            }

                            let _ = conn.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY created_at DESC LIMIT 1000)", ());
                        }
                    }
                }
            }
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = dirs::data_dir()
                .unwrap_or(PathBuf::from("."))
                .join("PowerClip");
            fs::create_dir_all(&data_dir).ok();

            let conn = init_database(&data_dir).map_err(|e| {
                eprintln!("数据库初始化失败: {}", e);
                e
            })?;

            let state = DatabaseState {
                conn: Mutex::new(conn),
            };
            app.manage(state);

            // 创建系统托盘
            let icon_data = include_bytes!("../icons/icon.png");
            let icon = Image::from_bytes(icon_data).map_err(|e| e.to_string())?;

            let tray_menu = MenuBuilder::new(app)
                .text("show", "显示窗口")
                .separator()
                .text("quit", "退出")
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&tray_menu)
                .tooltip("PowerClip - 剪贴板历史")
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        if let Some(app) = tray.app_handle().get_webview_window("main") {
                            let _ = app.show();
                            let _ = app.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 启动剪贴板监控
            let app_handle = app.handle().clone();
            start_clipboard_monitor(app_handle.clone());

            // 启动全局快捷键监控 (macOS)
            #[cfg(target_os = "macos")]
            {
                start_hotkey_monitor(app_handle.clone());
            }

            // macOS: 设置窗口透明
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    // 通过 JS 设置 webview 背景透明
                    let _ = window.eval("document.body.style.backgroundColor = 'transparent';");
                    let _ = window.eval("document.documentElement.style.backgroundColor = 'transparent';");
                    eprintln!("[PowerClip] Transparent window enabled");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_history,
            copy_to_clipboard,
            toggle_window,
            drag_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
