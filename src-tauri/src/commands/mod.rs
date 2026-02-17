//! Commands module - Tauri commands for frontend
//!
//! All Tauri commands are defined here for better organization.

use std::collections::HashMap;
use std::fs;
use std::sync::{Mutex, LazyLock};

use image::{GenericImageView, ImageFormat, ImageReader, RgbaImage};
use serde::Serialize;
use std::io::Cursor;

use crate::clipboard::{self, ClipboardContent};
use crate::db::{self, ClipboardItem as DbClipboardItem};
use crate::logger;
use crate::config::{data_dir, images_dir};
use crate::app_settings;

/// Clipboard item returned to frontend
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: String,
    pub content: String,
    pub hash: String,
    pub created_at: String,
}

/// Image cache for clipboard images (store in memory to avoid file path issues)
#[derive(Debug)]
struct ImageCache {
    images: Mutex<HashMap<String, Vec<u8>>>,
}

impl ImageCache {
    fn new() -> Self {
        Self {
            images: Mutex::new(HashMap::new()),
        }
    }

    fn get(&self, hash: &str) -> Option<Vec<u8>> {
        self.images.lock().unwrap().get(hash).cloned()
    }

    fn insert(&self, hash: String, data: Vec<u8>) {
        self.images.lock().unwrap().insert(hash, data);
    }
}

/// Global image cache
static IMAGE_CACHE: LazyLock<ImageCache> = LazyLock::new(|| ImageCache::new());

/// Convert database item to API item
impl From<DbClipboardItem> for ClipboardItem {
    fn from(item: DbClipboardItem) -> Self {
        Self {
            id: item.id,
            item_type: item.item_type,
            content: item.content,
            hash: item.hash,
            created_at: item.created_at,
        }
    }
}

/// Get clipboard history
#[tauri::command]
pub async fn get_history(
    state: tauri::State<'_, crate::DatabaseState>,
    limit: i64,
) -> Result<Vec<ClipboardItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let items = db::get_history(&conn, limit).map_err(|e| e.to_string())?;
    logger::debug("Commands", &format!("Retrieved {} history items", items.len()));
    Ok(items.into_iter().map(|i| i.into()).collect())
}

/// Copy item to system clipboard
///
/// This is the main function for copying clipboard history items.
/// It properly handles both text and images using arboard.
#[tauri::command]
pub async fn copy_to_clipboard(
    item: ClipboardItem,
    _state: tauri::State<'_, crate::DatabaseState>,
) -> Result<(), String> {
    logger::info("Commands", &format!("copy_to_clipboard id={}, type={}", item.id, item.item_type));

    if item.item_type == "image" {
        // Try to copy from image cache first
        if let Some(image_data) = IMAGE_CACHE.get(&item.hash) {
            copy_image_from_bytes(&image_data)?;
            logger::debug("Commands", &format!("Image copied from cache: {} bytes", image_data.len()));
            return Ok(());
        }

        // Fallback: load from file
        copy_image_to_clipboard(&item.content).await?;
    } else {
        // Copy text to clipboard
        copy_text_to_clipboard(&item.content).await?;
    }

    logger::debug("Commands", "Item copied to system clipboard");
    Ok(())
}

/// Copy text content to system clipboard using arboard
#[inline]
async fn copy_text_to_clipboard(content: &str) -> Result<(), String> {
    clipboard::set_clipboard_text(content).map_err(|e| e.to_string())?;
    logger::debug("Commands", &format!("Text copied: {} chars", content.len()));
    Ok(())
}

/// Copy image from raw bytes to clipboard
fn copy_image_from_bytes(image_bytes: &[u8]) -> Result<(), String> {
    // Load image
    let img = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8();

    clipboard::set_clipboard_image(width, height, &rgba).map_err(|e| e.to_string())?;
    logger::debug("Commands", &format!("Image copied from bytes: {}x{}", width, height));

    Ok(())
}

/// Copy image to system clipboard using arboard (from file path)
#[inline]
async fn copy_image_to_clipboard(content: &str) -> Result<(), String> {
    let data_dir = data_dir();
    let image_path = data_dir.join(content);

    logger::debug("Commands", &format!("Loading image from: {:?}", image_path));

    // Load image from file
    let img = ImageReader::open(&image_path)
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8();

    clipboard::set_clipboard_image(width, height, &rgba).map_err(|e| e.to_string())?;
    logger::debug("Commands", &format!("Image copied: {}x{}", width, height));

    Ok(())
}

/// Simulate paste action (Cmd+V on macOS, Ctrl+V on Windows)
#[tauri::command]
pub async fn simulate_paste() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // First activate the previous app, then simulate Cmd+V
        let result = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to keystroke \"v\" using command down"])
            .output()
            .map_err(|e| e.to_string())?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            logger::error("Commands", &format!("Failed to simulate paste: {}", stderr));
            return Err(stderr.to_string());
        }

        logger::info("Commands", "Simulated paste (Cmd+V)");
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let result = Command::new("cmd")
            .args(["/C", "ctrl+v"])
            .output()
            .map_err(|e| e.to_string())?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            logger::error("Commands", &format!("Failed to simulate paste: {}", stderr));
            return Err(stderr.to_string());
        }

        logger::info("Commands", "Simulated paste (Ctrl+V)");
    }

    Ok(())
}

/// Get asset URL for an image path (for frontend display)
#[tauri::command]
pub async fn get_image_asset_url(relative_path: String) -> Result<String, String> {
    let data_dir = data_dir();
    let full_path = data_dir.join(&relative_path);

    // Check if file exists
    if !full_path.exists() {
        logger::debug("Commands", &format!("Image file not found: {:?}", full_path));
        return Err(format!("Image file not found: {:?}", full_path));
    }

    // Read image file and convert to base64 data URL
    let image_data = std::fs::read(&full_path).map_err(|e| e.to_string())?;

    // Try to detect format from content
    let mime_type = if image_data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if image_data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if image_data.starts_with(&[0x47, 0x49, 0x46, 0x38]) {
        "image/gif"
    } else {
        "image/png" // default to PNG
    };

    // Convert to base64
    let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_data);
    let data_url = format!("data:{};base64,{}", mime_type, base64_data);

    logger::debug("Commands", &format!("get_image_asset_url: {} -> data:{};base64,... ({} bytes)",
        relative_path, mime_type, image_data.len()));
    Ok(data_url)
}

/// Check clipboard for new content and save to database
///
/// This is the main function called by the clipboard monitor.
/// It reads the clipboard using arboard and saves new content.
/// If new content is saved, emits event to frontend.
#[tauri::command]
pub async fn check_clipboard(
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::{Emitter, Manager};

    let Some(content) = clipboard::get_clipboard_content() else {
        return Ok(());
    };

    // Get database connection
    let state = app.state::<crate::DatabaseState>();
    let conn = state.conn.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    let mut new_item_saved = false;

    match content {
        ClipboardContent::Text(text) => {
            let hash = db::calculate_hash(text.as_bytes());

            if let Some(new_item) = db::save_item(&conn, "text", &text, &hash).map_err(|e| e.to_string())? {
                logger::debug("Commands", &format!("Text saved: {} chars", text.len()));
                // Emit event to frontend with new item
                app.emit_to("main", "powerclip:new-item", &new_item).ok();
                new_item_saved = true;
            }
        }
        ClipboardContent::Image(image) => {
            // Calculate hash
            let hash = db::calculate_hash(&image.bytes);

            // Check if already exists
            let exists: Result<Option<i64>, _> = conn.query_row(
                "SELECT id FROM history WHERE hash = ?",
                [&hash],
                |row: &rusqlite::Row| row.get(0),
            );

            // Only save if new
            match exists {
                Ok(Some(_)) => {
                    // Image exists, update timestamp to make it the latest
                    let relative_path = format!("images/{}.png", hash);
                    if let Some(new_item) = db::save_item(&conn, "image", &relative_path, &hash).map_err(|e| e.to_string())? {
                        // Emit event to frontend with new item
                        app.emit_to("main", "powerclip:new-item", &new_item).ok();
                        new_item_saved = true;
                    }
                }
                _ => {
                    // Save image to file
                    let images = images_dir();
                    fs::create_dir_all(&images).map_err(|e| e.to_string())?;

                    let image_path = images.join(&format!("{}.png", hash));

                    // Save as PNG
                    let rgba = RgbaImage::from_vec(image.width, image.height, image.bytes)
                        .ok_or_else(|| "Failed to create image buffer".to_string())?;

                    rgba.save_with_format(&image_path, ImageFormat::Png)
                        .map_err(|e| e.to_string())?;

                    // Cache image in memory
                    let image_data = std::fs::read(&image_path).map_err(|e| e.to_string())?;
                    IMAGE_CACHE.insert(hash.clone(), image_data);

                    let relative_path = format!("images/{}.png", hash);
                    if let Some(new_item) = db::save_item(&conn, "image", &relative_path, &hash).map_err(|e| e.to_string())? {
                        // Emit event to frontend with new item
                        app.emit_to("main", "powerclip:new-item", &new_item).ok();
                        new_item_saved = true;
                    }
                }
            }
        }
    }

    // Auto cleanup if enabled
    if new_item_saved {
        let settings = app_settings::load_settings().unwrap_or_default();
        if settings.auto_cleanup_enabled && settings.max_items > 0 {
            if let Ok(deleted) = db::cleanup_old_items(&conn, settings.max_items) {
                if deleted > 0 {
                    logger::info("Commands", &format!("Auto-cleanup: deleted {} old items", deleted));
                }
            }
        }
    }

    Ok(())
}

/// Application settings returned to frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    pub auto_cleanup_enabled: bool,
    pub max_items: i64,
    pub hotkey_modifiers: String,
    pub hotkey_key: String,
    pub display_limit: i64,
    pub preview_max_length: i64,
    pub window_opacity: f64,
    pub auto_paste_enabled: bool,
}

impl From<app_settings::AppSettings> for Settings {
    fn from(s: app_settings::AppSettings) -> Self {
        Self {
            auto_cleanup_enabled: s.auto_cleanup_enabled,
            max_items: s.max_items,
            hotkey_modifiers: s.hotkey_modifiers,
            hotkey_key: s.hotkey_key,
            display_limit: s.display_limit,
            preview_max_length: s.preview_max_length,
            window_opacity: s.window_opacity,
            auto_paste_enabled: s.auto_paste_enabled,
        }
    }
}

/// Get current application settings
#[tauri::command]
pub async fn get_settings() -> Result<Settings, String> {
    logger::info("Commands", "get_settings called");
    let settings = app_settings::load_settings()?;
    logger::info("Commands", &format!("Loaded settings: auto_cleanup={}, max_items={}", settings.auto_cleanup_enabled, settings.max_items));
    Ok(settings.into())
}

/// Save application settings
#[tauri::command]
pub async fn save_settings(
    settings: Settings,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Manager;

    logger::info("Commands", &format!("save_settings called: auto_cleanup={}, max_items={}, hotkey={}+{}, display_limit={}, preview_max_length={}, window_opacity={}",
        settings.auto_cleanup_enabled, settings.max_items, settings.hotkey_modifiers, settings.hotkey_key,
        settings.display_limit, settings.preview_max_length, settings.window_opacity));

    let app_settings = app_settings::AppSettings {
        auto_cleanup_enabled: settings.auto_cleanup_enabled,
        max_items: settings.max_items,
        hotkey_modifiers: settings.hotkey_modifiers.clone(),
        hotkey_key: settings.hotkey_key.clone(),
        display_limit: settings.display_limit,
        preview_max_length: settings.preview_max_length,
        window_opacity: settings.window_opacity,
        auto_paste_enabled: settings.auto_paste_enabled,
    };
    app_settings::save_settings(&app_settings)?;

    // Re-register hotkey with new settings
    let state = app.state::<crate::HotkeyState>();
    let manager = state.manager.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        // Register new hotkey (automatically unregisters old one)
        crate::hotkey::register_hotkey_with_settings(
            &manager,
            &state.current_hotkey,
            &state.handler_installed,
            &window,
            &settings.hotkey_modifiers,
            &settings.hotkey_key,
        )?;

        // Note: Window opacity is applied on the frontend via CSS
    }

    logger::info("Commands", "Settings saved, hotkey updated");
    Ok(())
}

/// Set whether settings dialog is open
#[tauri::command]
pub async fn set_settings_dialog_open(
    open: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Manager;

    let state = app.state::<crate::AppState>();
    *state.settings_open.lock().map_err(|e| e.to_string())? = open;

    logger::debug("Commands", &format!("Settings dialog open: {}", open));
    Ok(())
}
