//! Database module - SQLite operations for clipboard history

use rusqlite::Connection;
use serde::Serialize;

use crate::config::{db_path, HISTORY_LIMIT};
use crate::logger;

/// Clipboard history item stored in database
#[derive(Debug, Clone, Serialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: String,
    pub content: String,
    pub hash: String,
    pub created_at: String,
}

/// Database connection state
#[derive(Debug)]
pub struct DatabaseState {
    pub conn: std::sync::Mutex<Connection>,
}

impl DatabaseState {
    /// Create a new database state with initialized connection
    pub fn new(_data_dir: &std::path::PathBuf) -> Result<Self, rusqlite::Error> {
        let db = db_path();
        let conn = Connection::open(&db)?;

        // Create table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            )",
            (),
        )?;

        // Create index for faster queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON history(created_at)", ())?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_hash ON history(hash)", ())?;

        logger::info("Database", &format!("Database initialized at {:?}", db));

        Ok(Self {
            conn: std::sync::Mutex::new(conn),
        })
    }
}

/// Calculate MD5 hash of content
#[inline]
pub fn calculate_hash(content: &[u8]) -> String {
    let digest = md5::compute(content);
    format!("{:x}", digest)
}

/// Insert or update a clipboard item
/// Returns Some(ClipboardItem) if a new item was inserted, None if just updated timestamp
#[inline]
pub fn save_item(
    conn: &Connection,
    item_type: &str,
    content: &str,
    hash: &str,
) -> Result<Option<ClipboardItem>, rusqlite::Error> {
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Check if already exists
    let exists: Result<Option<i64>, rusqlite::Error> = conn.query_row(
        "SELECT id FROM history WHERE hash = ?",
        [hash],
        |row| row.get(0),
    );

    match exists {
        Ok(Some(id)) => {
            // Update timestamp
            conn.execute(
                "UPDATE history SET created_at = ? WHERE id = ?",
                [&created_at, &id.to_string()],
            )?;
            logger::debug("Database", &format!("Updated existing item id={}", id));
            // Return None because it wasn't a new item
            Ok(None)
        }
        _ => {
            // Insert new
            conn.execute(
                "INSERT INTO history (type, content, hash, created_at) VALUES (?, ?, ?, ?)",
                (item_type, content, hash, &created_at),
            )?;

            // Get the inserted id
            let id = conn.last_insert_rowid();

            logger::debug("Database", &format!("Inserted new item hash={}", &hash[..8]));

            // Cleanup old records
            cleanup_old_records(conn)?;

            // Return the new item
            Ok(Some(ClipboardItem {
                id,
                item_type: item_type.to_string(),
                content: content.to_string(),
                hash: hash.to_string(),
                created_at,
            }))
        }
    }
}

/// Remove excess records beyond HISTORY_LIMIT
#[inline]
fn cleanup_old_records(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY created_at DESC LIMIT ?)",
        [HISTORY_LIMIT],
    )?;
    Ok(())
}

/// Get clipboard history items
#[inline]
pub fn get_history(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<ClipboardItem>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, type, content, hash, created_at FROM history ORDER BY created_at DESC LIMIT ?",
    )?;

    let items = stmt
        .query_map([limit], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                content: row.get(2)?,
                hash: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(items)
}

/// Delete an item by ID
#[inline]
pub fn delete_item(conn: &Connection, id: i64) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM history WHERE id = ?", [id])?;
    Ok(())
}

/// Clear all history
#[inline]
pub fn clear_history(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute("DELETE FROM history", ())?;
    Ok(())
}
