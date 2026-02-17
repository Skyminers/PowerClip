//! Clipboard module - Unified clipboard operations using arboard
//!
//! Provides a cross-platform interface for reading and writing clipboard content.

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
pub fn get_clipboard_content() -> Option<ClipboardContent> {
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
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// Set image to clipboard from raw RGBA pixels.
pub fn set_clipboard_image(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    let image = arboard::ImageData {
        width: width.try_into().unwrap(),
        height: height.try_into().unwrap(),
        bytes: std::borrow::Cow::Borrowed(pixels),
    };

    clipboard.set_image(image).map_err(|e| e.to_string())
}
