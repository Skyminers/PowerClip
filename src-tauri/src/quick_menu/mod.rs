//! Quick menu module - Minimal popup for quick clipboard access
//!
//! Provides state management for quick access to recent clipboard items.
//! The frontend renders this as an overlay on the main window.

use std::sync::Mutex;

use tauri::{Manager, Emitter};

use crate::db::ClipboardItem;
use crate::logger;

/// Quick menu state
pub struct QuickMenuState {
    pub visible: Mutex<bool>,
    pub selected_index: Mutex<usize>,
}

impl Default for QuickMenuState {
    fn default() -> Self {
        Self::new()
    }
}

impl QuickMenuState {
    pub fn new() -> Self {
        Self {
            visible: Mutex::new(false),
            selected_index: Mutex::new(0),
        }
    }
}

// SAFETY: QuickMenuState only contains Mutex<bool> and Mutex<usize>
unsafe impl Send for QuickMenuState {}
unsafe impl Sync for QuickMenuState {}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Show the quick menu (emit event to frontend)
#[tauri::command]
pub async fn show_quick_menu(
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Update state
    if let Some(state) = app.try_state::<QuickMenuState>() {
        if let Ok(mut visible) = state.visible.lock() {
            *visible = true;
        }
        if let Ok(mut index) = state.selected_index.lock() {
            *index = 0; // Reset selection
        }
    }

    // Emit event to frontend
    app.emit("powerclip:show-quick-menu", ())
        .map_err(|e| format!("Failed to emit show event: {}", e))?;

    logger::debug("QuickMenu", "Quick menu show event emitted");
    Ok(())
}

/// Hide the quick menu (emit event to frontend)
#[tauri::command]
pub async fn hide_quick_menu(
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Update state
    if let Some(state) = app.try_state::<QuickMenuState>() {
        if let Ok(mut visible) = state.visible.lock() {
            *visible = false;
        }
    }

    // Emit event to frontend
    app.emit("powerclip:hide-quick-menu", ())
        .map_err(|e| format!("Failed to emit hide event: {}", e))?;

    logger::debug("QuickMenu", "Quick menu hide event emitted");
    Ok(())
}

/// Select next item in quick menu
#[tauri::command]
pub fn quick_menu_select_next(
    app: tauri::AppHandle,
    total_items: usize,
) -> Result<usize, String> {
    let state = app.state::<QuickMenuState>();

    let mut index = state.selected_index.lock().unwrap();
    if total_items > 0 {
        *index = (*index + 1) % total_items;
    }

    Ok(*index)
}

/// Select previous item in quick menu
#[tauri::command]
pub fn quick_menu_select_prev(
    app: tauri::AppHandle,
    total_items: usize,
) -> Result<usize, String> {
    let state = app.state::<QuickMenuState>();

    let mut index = state.selected_index.lock().unwrap();
    if total_items > 0 {
        *index = if *index == 0 { total_items - 1 } else { *index - 1 };
    }

    Ok(*index)
}

/// Get current selected index
#[tauri::command]
pub fn quick_menu_get_selected(
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let state = app.state::<QuickMenuState>();
    let index = state.selected_index.lock().unwrap();
    Ok(*index)
}

/// Copy selected item and hide quick menu
#[tauri::command]
pub async fn quick_menu_copy_selected(
    app: tauri::AppHandle,
    items: Vec<ClipboardItem>,
) -> Result<bool, String> {
    let state = app.state::<QuickMenuState>();

    let index = *state.selected_index.lock().unwrap();

    if index >= items.len() {
        return Err("Invalid selection index".to_string());
    }

    let item = &items[index];

    // Copy to clipboard
    if item.item_type == "image" {
        // For images, load from file
        let relative_path = &item.content;
        let image_path = crate::config::data_dir().join(relative_path);

        use image::{ImageReader, GenericImageView};
        let img = ImageReader::open(&image_path)
            .map_err(|e| format!("Failed to open image: {}", e))?
            .decode()
            .map_err(|e| format!("Failed to decode image: {}", e))?;

        let (width, height) = img.dimensions();
        let rgba = img.to_rgba8();
        crate::clipboard::set_clipboard_image(width, height, &rgba)
            .map_err(|e| format!("Failed to set clipboard image: {}", e))?;
    } else if item.item_type == "file" {
        let paths: Vec<String> = serde_json::from_str(&item.content)
            .map_err(|e| format!("Failed to parse file paths: {}", e))?;
        crate::clipboard::set_clipboard_files(&paths)?;
    } else {
        crate::clipboard::set_clipboard_text(&item.content)?;
    }

    // Hide quick menu
    hide_quick_menu(app.clone()).await?;

    // Simulate paste
    crate::commands::paste::simulate_paste().await?;

    logger::info("QuickMenu", &format!("Copied and pasted item at index {}", index));

    Ok(true)
}

/// Check if quick menu is visible
#[tauri::command]
pub fn is_quick_menu_visible(
    app: tauri::AppHandle,
) -> Result<bool, String> {
    let state = app.state::<QuickMenuState>();
    let visible = state.visible.lock().unwrap();
    Ok(*visible)
}
