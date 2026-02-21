//! Clipboard module - Unified clipboard operations using arboard
//!
//! Provides a cross-platform interface for reading and writing clipboard content.
//! On macOS, clipboard operations must run on the main thread due to AppKit requirements.

use arboard::Clipboard;

/// Clipboard content variants.
#[derive(Debug, Clone)]
pub enum ClipboardContent {
    Text(String),
    Image(ImageData),
}

/// Image data extracted from clipboard.
#[derive(Debug, Clone)]
pub struct ImageData {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Get current clipboard content (image has priority over text).
///
/// Returns `None` if clipboard is empty or unavailable.
///
/// On macOS, this function dispatches to the main thread for AppKit compatibility.
#[cfg(target_os = "macos")]
pub fn get_clipboard_content() -> Option<ClipboardContent> {
    use std::sync::{Arc, Mutex};

    let result = Arc::new(Mutex::new(None));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        let content = get_clipboard_content_impl();
        *result_clone.lock().unwrap() = content;
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Get current clipboard content (image has priority over text).
///
/// Returns `None` if clipboard is empty or unavailable.
#[cfg(not(target_os = "macos"))]
pub fn get_clipboard_content() -> Option<ClipboardContent> {
    get_clipboard_content_impl()
}

/// Internal implementation for getting clipboard content.
fn get_clipboard_content_impl() -> Option<ClipboardContent> {
    let mut clipboard = Clipboard::new().ok()?;

    if let Ok(image) = clipboard.get_image() {
        let bytes = image.bytes.to_vec();
        if !bytes.is_empty() {
            return Some(ClipboardContent::Image(ImageData {
                bytes,
                width: image.width as u32,
                height: image.height as u32,
            }));
        }
    }

    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() && !text.contains('\0') {
            return Some(ClipboardContent::Text(text));
        }
    }

    None
}

/// Set text to clipboard.
///
/// On macOS, this function dispatches to the main thread for AppKit compatibility.
#[cfg(target_os = "macos")]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    let text = text.to_string();
    let result = Arc::new(Mutex::new(Err("Not executed".to_string())));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        *result_clone.lock().unwrap() = set_clipboard_text_impl(&text);
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Set text to clipboard.
#[cfg(not(target_os = "macos"))]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    set_clipboard_text_impl(text)
}

/// Internal implementation for setting clipboard text.
fn set_clipboard_text_impl(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// Set image to clipboard from raw RGBA pixels.
///
/// On macOS, this function dispatches to the main thread for AppKit compatibility.
#[cfg(target_os = "macos")]
pub fn set_clipboard_image(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    let pixels = pixels.to_vec();
    let result = Arc::new(Mutex::new(Err("Not executed".to_string())));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        *result_clone.lock().unwrap() = set_clipboard_image_impl(width, height, &pixels);
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Set image to clipboard from raw RGBA pixels.
#[cfg(not(target_os = "macos"))]
pub fn set_clipboard_image(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    set_clipboard_image_impl(width, height, pixels)
}

/// Internal implementation for setting clipboard image.
fn set_clipboard_image_impl(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    let image = arboard::ImageData {
        width: width.try_into().unwrap(),
        height: height.try_into().unwrap(),
        bytes: std::borrow::Cow::Borrowed(pixels),
    };

    clipboard.set_image(image).map_err(|e| e.to_string())
}
