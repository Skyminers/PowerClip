//! Commands module - Tauri command handlers
//!
//! Each sub-module groups related commands by domain.

pub mod history;
pub mod image;
pub mod paste;
pub mod settings;

use serde::Serialize;

/// Clipboard item returned to the frontend.
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: String,
    pub content: String,
    pub hash: String,
    pub created_at: String,
}
