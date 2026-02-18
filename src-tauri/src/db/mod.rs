//! Database module - SQLite operations for clipboard history

use rusqlite::Connection;
use serde::Serialize;

use crate::config::db_path;
use crate::logger;

/// Clipboard history item stored in database.
#[derive(Debug, Clone, Serialize)]
pub struct ClipboardItem {
    pub id: i64,
    pub item_type: String,
    pub content: String,
    pub hash: String,
    pub created_at: String,
}

/// Database connection state.
#[derive(Debug)]
pub struct DatabaseState {
    pub conn: std::sync::Mutex<Connection>,
}

impl DatabaseState {
    pub fn new(_data_dir: &std::path::PathBuf) -> Result<Self, rusqlite::Error> {
        let db = db_path();
        let conn = Connection::open(&db)?;

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

        conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON history(created_at)", ())?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_hash ON history(hash)", ())?;

        logger::info("Database", &format!("Initialized at {:?}", db));

        Ok(Self {
            conn: std::sync::Mutex::new(conn),
        })
    }
}

/// Calculate MD5 hash of content.
#[inline]
pub fn calculate_hash(content: &[u8]) -> String {
    format!("{:x}", md5::compute(content))
}

/// Insert or update a clipboard item.
///
/// Returns `Some(ClipboardItem)` if a new item was inserted, `None` if only the timestamp was updated.
pub fn save_item(
    conn: &Connection,
    item_type: &str,
    content: &str,
    hash: &str,
) -> Result<Option<ClipboardItem>, rusqlite::Error> {
    let created_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let existing_id: Result<Option<i64>, _> = conn.query_row(
        "SELECT id FROM history WHERE hash = ?",
        [hash],
        |row| row.get(0),
    );

    match existing_id {
        Ok(Some(id)) => {
            conn.execute(
                "UPDATE history SET created_at = ? WHERE id = ?",
                rusqlite::params![&created_at, id],
            )?;
            Ok(None)
        }
        _ => {
            conn.execute(
                "INSERT INTO history (type, content, hash, created_at) VALUES (?, ?, ?, ?)",
                (item_type, content, hash, &created_at),
            )?;

            let id = conn.last_insert_rowid();
            logger::debug("Database", &format!("New item hash={}", &hash[..8]));

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


/// Get clipboard history items.
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

/// Clean up old items beyond the specified limit.
///
/// Returns the number of items deleted.
pub fn cleanup_old_items(conn: &Connection, max_items: i64) -> Result<i64, rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))?;

    if count <= max_items {
        return Ok(0);
    }

    let to_delete = count - max_items;

    let mut stmt = conn.prepare("SELECT id, type, content FROM history ORDER BY created_at ASC LIMIT ?")?;
    let items_to_delete: Vec<(i64, String, String)> = stmt
        .query_map([to_delete], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .into_iter()
        .flatten()
        .filter_map(|r| r.ok())
        .collect();

    for (id, item_type, content) in items_to_delete {
        conn.execute("DELETE FROM history WHERE id = ?", [id])?;

        if item_type == "image" {
            if let Some(filename) = content.strip_prefix("images/") {
                let image_path = crate::config::images_dir().join(filename);
                let _ = std::fs::remove_file(image_path);
            }
        }
    }

    Ok(to_delete)
}
