//! Clipboard module - Unified clipboard operations using arboard
//!
//! This module provides a unified interface for clipboard operations across
//! all platforms (macOS, Linux, Windows). All clipboard access goes through
//! this module.

use crate::logger;

pub use arboard::Clipboard;

/// Represents content that can be in the clipboard
#[derive(Debug, Clone)]
pub enum ClipboardContent {
    Text(String),
    Image(ImageData),
}

/// Image data extracted from clipboard
#[derive(Debug, Clone)]
pub struct ImageData {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Get clipboard content (text or image)
///
/// Returns `None` if clipboard is empty or unavailable.
/// Priority: Image > Text (images are checked first)
#[inline]
pub fn get_clipboard_content() -> Option<ClipboardContent> {
    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            logger::debug("Clipboard", &format!("Failed to access clipboard: {}", e));
            return None;
        }
    };

    // Try to get image first (higher priority)
    match clipboard.get_image() {
        Ok(image) => {
            let bytes = image.bytes.to_vec();
            if !bytes.is_empty() {
                return Some(ClipboardContent::Image(ImageData {
                    bytes,
                    width: image.width as u32,
                    height: image.height as u32,
                }));
            }
        }
        Err(_) => {},
    }

    // Try to get text
    match clipboard.get_text() {
        Ok(text) => {
            if !text.is_empty() && !text.contains('\0') {
                logger::debug("Clipboard", &format!("Text detected: {} chars", text.len()));
                return Some(ClipboardContent::Text(text));
            }
        }
        Err(e) => {
            logger::debug("Clipboard", &format!("No text in clipboard: {}", e));
        }
    }

    None
}

/// Set text to clipboard
///
/// Returns `Ok(())` on success, or an error message on failure.
#[inline]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// Set image to clipboard
///
/// The image data should be raw RGBA pixels.
#[inline]
pub fn set_clipboard_image(
    width: u32,
    height: u32,
    pixels: &[u8],
) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    let image = arboard::ImageData {
        width: width.try_into().unwrap(),
        height: height.try_into().unwrap(),
        bytes: std::borrow::Cow::Borrowed(pixels),
    };

    clipboard.set_image(image).map_err(|e| e.to_string())
}
