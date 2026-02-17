//! Image commands - Image asset serving and in-memory cache

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{LazyLock, Mutex};

use image::{GenericImageView, ImageReader};

use crate::clipboard;
use crate::config::data_dir;

/// In-memory cache for clipboard images.
pub(crate) struct ImageCache {
    images: Mutex<HashMap<String, Vec<u8>>>,
}

impl ImageCache {
    fn new() -> Self {
        Self {
            images: Mutex::new(HashMap::new()),
        }
    }

    pub fn get(&self, hash: &str) -> Option<Vec<u8>> {
        self.images.lock().unwrap().get(hash).cloned()
    }

    pub fn insert(&self, hash: String, data: Vec<u8>) {
        self.images.lock().unwrap().insert(hash, data);
    }
}

pub(crate) static IMAGE_CACHE: LazyLock<ImageCache> = LazyLock::new(ImageCache::new);

/// Copy image from raw bytes to clipboard.
pub(crate) fn copy_image_from_bytes(image_bytes: &[u8]) -> Result<(), String> {
    let img = ImageReader::new(Cursor::new(image_bytes))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8();

    clipboard::set_clipboard_image(width, height, &rgba).map_err(|e| e.to_string())
}

/// Get a base64 data URL for an image stored on disk.
#[tauri::command]
pub async fn get_image_asset_url(relative_path: String) -> Result<String, String> {
    let full_path = data_dir().join(&relative_path);

    if !full_path.exists() {
        return Err(format!("Image file not found: {:?}", full_path));
    }

    let image_data = std::fs::read(&full_path).map_err(|e| e.to_string())?;

    let mime_type = detect_image_mime(&image_data);
    let base64_data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_data);

    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}

/// Detect MIME type from image magic bytes.
fn detect_image_mime(data: &[u8]) -> &'static str {
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if data.starts_with(&[0x47, 0x49, 0x46, 0x38]) {
        "image/gif"
    } else {
        "image/png"
    }
}
