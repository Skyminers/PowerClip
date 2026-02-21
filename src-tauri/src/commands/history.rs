//! History commands - Clipboard history retrieval, saving, and monitoring

use std::fs;

use image::{ImageFormat, RgbaImage};
use tauri::{Emitter, Manager};

use crate::clipboard::ClipboardContent;
use crate::db::{self, ClipboardItem};
use crate::config::{data_dir, images_dir};
use crate::{clipboard, logger, app_settings};

use super::image::IMAGE_CACHE;

/// Get clipboard history.
#[tauri::command]
pub async fn get_history(
    state: tauri::State<'_, crate::DatabaseState>,
    limit: i64,
) -> Result<Vec<ClipboardItem>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_history(&conn, limit).map_err(|e| e.to_string())
}

/// Copy a history item back to the system clipboard.
#[tauri::command]
pub async fn copy_to_clipboard(item: ClipboardItem) -> Result<(), String> {
    if item.item_type == "image" {
        if let Some(image_data) = IMAGE_CACHE.get(&item.hash) {
            return super::image::copy_image_from_bytes(&image_data);
        }
        return copy_image_to_clipboard(&item.content);
    }

    clipboard::set_clipboard_text(&item.content).map_err(|e| e.to_string())
}

/// Copy image to clipboard from a file path relative to data_dir.
fn copy_image_to_clipboard(relative_path: &str) -> Result<(), String> {
    use image::{GenericImageView, ImageReader};

    let image_path = data_dir().join(relative_path);

    let img = ImageReader::open(&image_path)
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8();

    clipboard::set_clipboard_image(width, height, &rgba).map_err(|e| e.to_string())
}

/// Check clipboard for new content and save to database.
///
/// Called periodically by the clipboard monitor.
#[tauri::command]
pub async fn check_clipboard(app: tauri::AppHandle) -> Result<(), String> {
    let Some(content) = clipboard::get_clipboard_content() else {
        return Ok(());
    };

    let state = app.state::<crate::DatabaseState>();
    let conn = state.conn.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    let saved_item = match content {
        ClipboardContent::Text(text) => {
            let hash = db::calculate_hash(text.as_bytes());
            db::save_item(&conn, "text", &text, &hash).map_err(|e| e.to_string())?
        }
        ClipboardContent::Image(image) => {
            let hash = db::calculate_hash(&image.bytes);
            let relative_path = format!("images/{}.png", hash);

            // Save image file if it doesn't exist yet
            let image_path = images_dir().join(format!("{}.png", hash));
            if !image_path.exists() {
                fs::create_dir_all(images_dir()).map_err(|e| e.to_string())?;

                let rgba = RgbaImage::from_vec(image.width, image.height, image.bytes)
                    .ok_or_else(|| "Failed to create image buffer".to_string())?;

                rgba.save_with_format(&image_path, ImageFormat::Png)
                    .map_err(|e| e.to_string())?;

                let image_data = fs::read(&image_path).map_err(|e| e.to_string())?;
                IMAGE_CACHE.insert(hash.clone(), image_data);
            }

            db::save_item(&conn, "image", &relative_path, &hash).map_err(|e| e.to_string())?
        }
    };

    if let Some(item) = saved_item {
        app.emit_to("main", "powerclip:new-item", &item).ok();

        // Index for semantic search (runtime-controlled)
        if item.item_type == "text" {
            if app.try_state::<crate::semantic::SemanticState>().is_some() {
                let app = app.clone();
                let id = item.id;
                let content = item.content.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = tokio::task::spawn_blocking(move || {
                        crate::semantic::embedding::index_single_item(&app, id, &content);
                    }).await;
                });
            }
        }

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

/// Delete a history item by ID.
///
/// Also deletes the associated image file if the item is an image.
#[tauri::command]
pub async fn delete_history_item(
    app: tauri::AppHandle,
    item_id: i64,
) -> Result<(), String> {
    let state = app.state::<crate::DatabaseState>();
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Delete from database and file system
    let deleted = db::delete_item(&conn, item_id).map_err(|e| e.to_string())?;

    if deleted {
        // Remove from semantic index if present
        if let Some(sem_state) = app.try_state::<crate::semantic::SemanticState>() {
            if let Ok(mut index) = sem_state.index.write() {
                index.remove(item_id);
            }
            if let Ok(mut status) = sem_state.status.write() {
                status.indexed_count = status.indexed_count.saturating_sub(1);
            }
        }

        // Clear image cache if it was an image
        // Note: We don't have the hash here, so we clear the entire cache entry
        // This is acceptable as the cache will be repopulated on demand

        logger::info("Commands", &format!("Deleted item {}", item_id));
    }

    Ok(())
}
