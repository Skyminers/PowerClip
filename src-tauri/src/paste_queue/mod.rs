//! Paste queue module - Sequential paste functionality
//!
//! Allows users to queue multiple clipboard items and paste them sequentially.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Manager, Emitter};

use crate::db::ClipboardItem;
use crate::logger;

/// A queued item with its position in the queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedItem {
    pub position: usize,
    pub item: ClipboardItem,
}

/// Paste queue state managed by Tauri.
pub struct PasteQueueState {
    pub queue: Mutex<Vec<ClipboardItem>>,
}

impl Default for PasteQueueState {
    fn default() -> Self {
        Self::new()
    }
}

impl PasteQueueState {
    pub fn new() -> Self {
        Self {
            queue: Mutex::new(Vec::new()),
        }
    }

    /// Add an item to the end of the queue.
    /// Returns the new queue length.
    pub fn add(&self, item: ClipboardItem) -> usize {
        let mut queue = self.queue.lock().unwrap();
        queue.push(item);
        let len = queue.len();
        logger::debug("PasteQueue", &format!("Added item to queue, length now: {}", len));
        len
    }

    /// Get all items in the queue with their positions.
    pub fn get_all(&self) -> Vec<QueuedItem> {
        let queue = self.queue.lock().unwrap();
        queue
            .iter()
            .enumerate()
            .map(|(i, item)| QueuedItem {
                position: i + 1,
                item: item.clone(),
            })
            .collect()
    }

    /// Get the number of items in the queue.
    pub fn len(&self) -> usize {
        self.queue.lock().unwrap().len()
    }

    /// Check if the queue is empty.
    pub fn is_empty(&self) -> bool {
        self.queue.lock().unwrap().is_empty()
    }

    /// Remove and return the first item from the queue.
    /// Returns None if the queue is empty.
    pub fn pop_first(&self) -> Option<ClipboardItem> {
        let mut queue = self.queue.lock().unwrap();
        if queue.is_empty() {
            None
        } else {
            let item = queue.remove(0);
            logger::debug("PasteQueue", &format!("Popped first item, {} remaining", queue.len()));
            Some(item)
        }
    }

    /// Remove a specific item from the queue by position (1-indexed).
    /// Returns true if the item was removed.
    pub fn remove_at(&self, position: usize) -> bool {
        let mut queue = self.queue.lock().unwrap();
        if position == 0 || position > queue.len() {
            return false;
        }
        queue.remove(position - 1);
        logger::debug("PasteQueue", &format!("Removed item at position {}, {} remaining", position, queue.len()));
        true
    }

    /// Clear all items from the queue.
    pub fn clear(&self) {
        let mut queue = self.queue.lock().unwrap();
        queue.clear();
        logger::debug("PasteQueue", "Queue cleared");
    }
}

// SAFETY: PasteQueueState only contains a Mutex<Vec<ClipboardItem>>,
// and ClipboardItem is Send + Sync (contains only String and i64 fields).
unsafe impl Send for PasteQueueState {}
unsafe impl Sync for PasteQueueState {}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Add an item to the paste queue.
#[tauri::command]
pub fn add_to_paste_queue(
    app: tauri::AppHandle,
    item: ClipboardItem,
) -> Result<usize, String> {
    let state = app.state::<PasteQueueState>();
    let len = state.add(item);

    // Emit event to frontend
    let _ = app.emit("powerclip:paste-queue-changed", len);

    Ok(len)
}

/// Get all items in the paste queue.
#[tauri::command]
pub fn get_paste_queue(
    app: tauri::AppHandle,
) -> Result<Vec<QueuedItem>, String> {
    let state = app.state::<PasteQueueState>();
    Ok(state.get_all())
}

/// Get the number of items in the paste queue.
#[tauri::command]
pub fn get_paste_queue_count(
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let state = app.state::<PasteQueueState>();
    Ok(state.len())
}

/// Paste the next item in the queue.
/// This copies the first item to clipboard, hides the window, and simulates paste.
/// Returns the pasted item if successful, None if queue is empty.
#[tauri::command]
pub async fn paste_next_in_queue(
    app: tauri::AppHandle,
) -> Result<Option<ClipboardItem>, String> {
    let state = app.state::<PasteQueueState>();

    // Get the first item
    let item = state.pop_first();

    if let Some(ref clipboard_item) = item {
        // Copy to clipboard
        if clipboard_item.item_type == "image" {
            // For images, we need to handle the image data
            let image_data = crate::commands::image::IMAGE_CACHE.get(&clipboard_item.hash);
            if let Some(data) = image_data {
                crate::commands::image::copy_image_from_bytes(&data)?;
            } else {
                // Load from file
                let relative_path = &clipboard_item.content;
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
            }
        } else if clipboard_item.item_type == "file" {
            // Parse file paths and set to clipboard
            let paths: Vec<String> = serde_json::from_str(&clipboard_item.content)
                .map_err(|e| format!("Failed to parse file paths: {}", e))?;
            crate::clipboard::set_clipboard_files(&paths)?;
        } else {
            // Text
            crate::clipboard::set_clipboard_text(&clipboard_item.content)?;
        }

        // Hide window
        crate::window::commands::hide_window(app.clone()).await.map_err(|e| e.to_string())?;

        // Small delay before paste to ensure clipboard is ready
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        // Simulate paste
        crate::commands::paste::simulate_paste().await?;

        // Emit event to frontend
        let remaining = state.len();
        let _ = app.emit("powerclip:paste-queue-changed", remaining);

        logger::info("PasteQueue", &format!("Pasted item, {} remaining in queue", remaining));
    }

    Ok(item)
}

/// Remove an item from the queue by position (1-indexed).
#[tauri::command]
pub fn remove_from_paste_queue(
    app: tauri::AppHandle,
    position: usize,
) -> Result<bool, String> {
    let state = app.state::<PasteQueueState>();
    let removed = state.remove_at(position);

    if removed {
        let remaining = state.len();
        let _ = app.emit("powerclip:paste-queue-changed", remaining);
    }

    Ok(removed)
}

/// Clear all items from the paste queue.
#[tauri::command]
pub fn clear_paste_queue(
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state = app.state::<PasteQueueState>();
    state.clear();

    let _ = app.emit("powerclip:paste-queue-changed", 0);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_item(id: i64, content: &str) -> ClipboardItem {
        ClipboardItem {
            id,
            item_type: "text".to_string(),
            content: content.to_string(),
            hash: format!("hash{}", id),
            created_at: "2024-01-01 00:00:00".to_string(),
        }
    }

    #[test]
    fn test_empty_queue() {
        let state = PasteQueueState::new();
        assert!(state.is_empty());
        assert_eq!(state.len(), 0);
        assert!(state.pop_first().is_none());
    }

    #[test]
    fn test_add_and_pop() {
        let state = PasteQueueState::new();
        let item1 = create_test_item(1, "first");
        let item2 = create_test_item(2, "second");

        state.add(item1.clone());
        state.add(item2.clone());

        assert_eq!(state.len(), 2);

        let popped = state.pop_first();
        assert!(popped.is_some());
        assert_eq!(popped.unwrap().id, 1);
        assert_eq!(state.len(), 1);

        let popped = state.pop_first();
        assert!(popped.is_some());
        assert_eq!(popped.unwrap().id, 2);
        assert_eq!(state.len(), 0);
    }

    #[test]
    fn test_remove_at() {
        let state = PasteQueueState::new();
        let item1 = create_test_item(1, "first");
        let item2 = create_test_item(2, "second");
        let item3 = create_test_item(3, "third");

        state.add(item1);
        state.add(item2);
        state.add(item3);

        // Remove middle item (position 2)
        assert!(state.remove_at(2));
        assert_eq!(state.len(), 2);

        let items = state.get_all();
        assert_eq!(items[0].item.id, 1);
        assert_eq!(items[1].item.id, 3);

        // Invalid positions
        assert!(!state.remove_at(0));
        assert!(!state.remove_at(10));
    }

    #[test]
    fn test_clear() {
        let state = PasteQueueState::new();
        state.add(create_test_item(1, "first"));
        state.add(create_test_item(2, "second"));

        assert_eq!(state.len(), 2);

        state.clear();

        assert!(state.is_empty());
        assert_eq!(state.len(), 0);
    }

    #[test]
    fn test_get_all() {
        let state = PasteQueueState::new();
        let item1 = create_test_item(1, "first");
        let item2 = create_test_item(2, "second");

        state.add(item1);
        state.add(item2);

        let items = state.get_all();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].position, 1);
        assert_eq!(items[0].item.id, 1);
        assert_eq!(items[1].position, 2);
        assert_eq!(items[1].item.id, 2);
    }
}
