//! Snippets commands - Tauri command handlers for quick commands

use tauri::State;

use crate::db::{DatabaseState, snippets};

/// Get all snippets.
#[tauri::command]
pub fn get_snippets(db: State<DatabaseState>) -> Result<Vec<snippets::Snippet>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    snippets::get_snippets(&conn).map_err(|e| e.to_string())
}

/// Add a new snippet.
#[tauri::command]
pub fn add_snippet(
    db: State<DatabaseState>,
    content: String,
    alias: Option<String>,
) -> Result<snippets::Snippet, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    snippets::add_snippet(&conn, &content, alias.as_deref()).map_err(|e| e.to_string())
}

/// Update an existing snippet.
#[tauri::command]
pub fn update_snippet(
    db: State<DatabaseState>,
    id: i64,
    content: String,
    alias: Option<String>,
) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    snippets::update_snippet(&conn, id, &content, alias.as_deref()).map_err(|e| e.to_string())
}

/// Delete a snippet.
#[tauri::command]
pub fn delete_snippet(db: State<DatabaseState>, id: i64) -> Result<bool, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    snippets::delete_snippet(&conn, id).map_err(|e| e.to_string())
}
