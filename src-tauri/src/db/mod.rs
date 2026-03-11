//! Database module - SQLite operations for clipboard history

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::config::db_path;
use crate::logger;

pub mod snippets;

/// Clipboard history item stored in database.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub fn new() -> Result<Self, rusqlite::Error> {
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

        // Semantic search embeddings table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS embeddings (
                item_id INTEGER PRIMARY KEY REFERENCES history(id) ON DELETE CASCADE,
                embedding BLOB NOT NULL,
                dim INTEGER NOT NULL DEFAULT 256
            )",
            (),
        )?;
        conn.execute("PRAGMA foreign_keys = ON", ())?;

        // Snippets table for quick commands
        conn.execute(
            "CREATE TABLE IF NOT EXISTS snippets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                alias TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            (),
        )?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_snippets_updated ON snippets(updated_at DESC)", ())?;

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
            let hash_preview = if hash.len() > 8 { &hash[..8] } else { hash };
            logger::debug("Database", &format!("New item hash={}", hash_preview));

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

    // Collect image paths to clean up before batch deletion
    let mut stmt = conn.prepare("SELECT type, content FROM history ORDER BY created_at ASC LIMIT ?")?;
    let image_paths: Vec<String> = stmt
        .query_map([to_delete], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .into_iter()
        .flatten()
        .filter_map(|r| r.ok())
        .filter_map(|(item_type, content)| {
            if item_type == "image" {
                content.strip_prefix("images/").map(|f| f.to_string())
            } else {
                None
            }
        })
        .collect();

    // Batch delete in a single SQL statement
    conn.execute(
        "DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY created_at ASC LIMIT ?)",
        [to_delete],
    )?;

    // Clean up image files
    for filename in image_paths {
        let image_path = crate::config::images_dir().join(&filename);
        let _ = std::fs::remove_file(image_path);
    }

    Ok(to_delete)
}

/// Delete a single item by ID.
///
/// Also deletes the associated image file if the item is an image.
/// Returns true if an item was deleted, false if not found.
pub fn delete_item(conn: &Connection, item_id: i64) -> Result<bool, rusqlite::Error> {
    // First, get the item to check if it's an image
    let item_info: Result<(String, String), _> = conn.query_row(
        "SELECT type, content FROM history WHERE id = ?",
        [item_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    let deleted = match item_info {
        Ok((item_type, content)) => {
            // Delete from database
            let affected = conn.execute("DELETE FROM history WHERE id = ?", [item_id])?;

            if affected > 0 {
                // If it was an image, delete the file
                if item_type == "image" {
                    if let Some(filename) = content.strip_prefix("images/") {
                        let image_path = crate::config::images_dir().join(filename);
                        if let Err(e) = std::fs::remove_file(&image_path) {
                            logger::warning("Database", &format!("Failed to delete image file: {}", e));
                        } else {
                            logger::debug("Database", &format!("Deleted image file: {:?}", image_path));
                        }
                    }
                }
                true
            } else {
                false
            }
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => false,
        Err(e) => return Err(e),
    };

    Ok(deleted)
}

/// Create the history table if it doesn't exist (for testing).
#[cfg(test)]
fn create_history_table(conn: &Connection) -> Result<(), rusqlite::Error> {
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create an in-memory database with history table
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory DB");
        create_history_table(&conn).expect("Failed to create history table");
        conn
    }

    // ========== calculate_hash tests ==========

    #[test]
    fn test_calculate_hash_empty() {
        let hash = calculate_hash(b"");
        assert_eq!(hash.len(), 32); // MD5 produces 32 hex characters
        assert_eq!(hash, "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn test_calculate_hash_simple() {
        let hash = calculate_hash(b"hello");
        assert_eq!(hash, "5d41402abc4b2a76b9719d911017c592");
    }

    #[test]
    fn test_calculate_hash_consistency() {
        let content = b"test content 123";
        let hash1 = calculate_hash(content);
        let hash2 = calculate_hash(content);
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_calculate_hash_different_inputs() {
        let hash1 = calculate_hash(b"input1");
        let hash2 = calculate_hash(b"input2");
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_calculate_hash_unicode() {
        let hash = calculate_hash("你好世界".as_bytes());
        assert_eq!(hash.len(), 32);
    }

    // ========== save_item tests ==========

    #[test]
    fn test_save_item_new() {
        let conn = setup_test_db();

        let result = save_item(&conn, "text", "Hello World", "hash123")
            .expect("Failed to save item");

        assert!(result.is_some());
        let item = result.unwrap();
        assert!(item.id > 0);
        assert_eq!(item.item_type, "text");
        assert_eq!(item.content, "Hello World");
        assert_eq!(item.hash, "hash123");
        assert!(!item.created_at.is_empty());
    }

    #[test]
    fn test_save_item_duplicate_hash_updates_timestamp() {
        let conn = setup_test_db();

        // First save
        let result1 = save_item(&conn, "text", "Original content", "same_hash_value")
            .expect("Failed to save first item");
        assert!(result1.is_some());
        let item1 = result1.unwrap();

        // Delay to ensure different timestamp (1 second precision)
        std::thread::sleep(std::time::Duration::from_millis(1100));

        // Second save with same hash
        let result2 = save_item(&conn, "text", "Original content", "same_hash_value")
            .expect("Failed to update item");
        assert!(result2.is_none()); // Should return None for update

        // Verify only one item exists
        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, item1.id);
    }

    #[test]
    fn test_save_item_different_types() {
        let conn = setup_test_db();

        save_item(&conn, "text", "Text content", "hash1").unwrap();
        save_item(&conn, "image", "images/test.png", "hash2").unwrap();
        save_item(&conn, "file", "/path/to/file", "hash3").unwrap();

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items.len(), 3);
    }

    // ========== get_history tests ==========

    #[test]
    fn test_get_history_empty() {
        let conn = setup_test_db();

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert!(items.is_empty());
    }

    #[test]
    fn test_get_history_respects_limit() {
        let conn = setup_test_db();

        // Add 20 items
        for i in 0..20 {
            save_item(&conn, "text", &format!("Content {}", i), &format!("hash{}", i)).unwrap();
        }

        let items = get_history(&conn, 5).expect("Failed to get history");
        assert_eq!(items.len(), 5);
    }

    #[test]
    fn test_get_history_ordered_by_created_at_desc() {
        let conn = setup_test_db();

        // Add items with delays to ensure different timestamps (1 second precision)
        for i in 1..=3 {
            save_item(&conn, "text", &format!("Item {}", i), &format!("hash_{}", i)).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(1100));
        }

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items.len(), 3);
        // Most recent should be first
        assert_eq!(items[0].content, "Item 3");
        assert_eq!(items[1].content, "Item 2");
        assert_eq!(items[2].content, "Item 1");
    }

    // ========== delete_item tests ==========

    #[test]
    fn test_delete_item_existing() {
        let conn = setup_test_db();

        let item = save_item(&conn, "text", "To be deleted", "delete_hash")
            .expect("Failed to save item")
            .unwrap();

        let deleted = delete_item(&conn, item.id).expect("Failed to delete item");
        assert!(deleted);

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert!(items.is_empty());
    }

    #[test]
    fn test_delete_item_nonexistent() {
        let conn = setup_test_db();

        let deleted = delete_item(&conn, 999).expect("Failed to execute delete");
        assert!(!deleted);
    }

    #[test]
    fn test_delete_item_specific() {
        let conn = setup_test_db();

        let item1 = save_item(&conn, "text", "Item 1", "hash1").unwrap().unwrap();
        let item2 = save_item(&conn, "text", "Item 2", "hash2").unwrap().unwrap();
        let item3 = save_item(&conn, "text", "Item 3", "hash3").unwrap().unwrap();

        // Delete middle item
        let deleted = delete_item(&conn, item2.id).expect("Failed to delete item");
        assert!(deleted);

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|i| i.id == item1.id));
        assert!(items.iter().any(|i| i.id == item3.id));
        assert!(!items.iter().any(|i| i.id == item2.id));
    }

    // ========== cleanup_old_items tests ==========

    #[test]
    fn test_cleanup_no_items() {
        let conn = setup_test_db();

        let deleted = cleanup_old_items(&conn, 100).expect("Failed to cleanup");
        assert_eq!(deleted, 0);
    }

    #[test]
    fn test_cleanup_below_limit() {
        let conn = setup_test_db();

        for i in 0..5 {
            save_item(&conn, "text", &format!("Content {}", i), &format!("hash{}", i)).unwrap();
        }

        let deleted = cleanup_old_items(&conn, 10).expect("Failed to cleanup");
        assert_eq!(deleted, 0);

        let items = get_history(&conn, 100).expect("Failed to get history");
        assert_eq!(items.len(), 5);
    }

    #[test]
    fn test_cleanup_above_limit() {
        let conn = setup_test_db();

        // Add 15 items
        for i in 0..15 {
            save_item(&conn, "text", &format!("Content {}", i), &format!("hash{}", i)).unwrap();
        }

        let deleted = cleanup_old_items(&conn, 10).expect("Failed to cleanup");
        assert_eq!(deleted, 5);

        let items = get_history(&conn, 100).expect("Failed to get history");
        assert_eq!(items.len(), 10);
    }

    #[test]
    fn test_cleanup_removes_oldest() {
        let conn = setup_test_db();

        // Add items with delays (1 second precision for timestamps)
        for i in 0..5 {
            save_item(&conn, "text", &format!("Content {}", i), &format!("hash_{}", i)).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(1100));
        }

        // Cleanup to keep only 3
        cleanup_old_items(&conn, 3).expect("Failed to cleanup");

        let items = get_history(&conn, 100).expect("Failed to get history");
        assert_eq!(items.len(), 3);
        // Should keep the newest items (4, 3, 2)
        assert!(items.iter().any(|i| i.content == "Content 4"));
        assert!(items.iter().any(|i| i.content == "Content 3"));
        assert!(items.iter().any(|i| i.content == "Content 2"));
        assert!(!items.iter().any(|i| i.content == "Content 0"));
        assert!(!items.iter().any(|i| i.content == "Content 1"));
    }

    // ========== Integration tests ==========

    #[test]
    fn test_full_lifecycle() {
        let conn = setup_test_db();

        // Add items
        let item1 = save_item(&conn, "text", "First item", "hash1").unwrap().unwrap();
        let item2 = save_item(&conn, "text", "Second item", "hash2").unwrap().unwrap();
        let item3 = save_item(&conn, "text", "Third item", "hash3").unwrap().unwrap();

        // Get history
        let items = get_history(&conn, 10).unwrap();
        assert_eq!(items.len(), 3);

        // Delete one
        delete_item(&conn, item2.id).unwrap();

        // Verify
        let items = get_history(&conn, 10).unwrap();
        assert_eq!(items.len(), 2);

        // Update one (re-save with same hash)
        save_item(&conn, "text", "First item", "hash1").unwrap();

        // Verify still 2 items
        let items = get_history(&conn, 10).unwrap();
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn test_special_characters_in_content() {
        let conn = setup_test_db();

        let item1 = save_item(&conn, "text", "First item", "hash1").unwrap();
        let item3 = save_item(&conn, "text", "Third item", "hash3").unwrap();

        let special_content = "Hello \"world\" \n\t with 'quotes' and $pecial ch@rs!";
        let hash = calculate_hash(special_content.as_bytes());

        let result = save_item(&conn, "text", special_content, &hash)
            .expect("Failed to save item with special chars");
        assert!(result.is_some());

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, special_content);
    }

    #[test]
    fn test_unicode_content() {
        let conn = setup_test_db();

        let unicode_content = "你好世界 🌍 مرحبا Hello";
        let hash = calculate_hash(unicode_content.as_bytes());

        let result = save_item(&conn, "text", unicode_content, &hash)
            .expect("Failed to save item with unicode");
        assert!(result.is_some());

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items[0].content, unicode_content);
    }

    #[test]
    fn test_large_content() {
        let conn = setup_test_db();

        let large_content = "x".repeat(100000);
        let hash = calculate_hash(large_content.as_bytes());

        let result = save_item(&conn, "text", &large_content, &hash)
            .expect("Failed to save large item");
        assert!(result.is_some());

        let items = get_history(&conn, 10).expect("Failed to get history");
        assert_eq!(items[0].content.len(), 100000);
    }
}
