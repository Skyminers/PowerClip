//! Snippets database operations - Quick commands storage

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// Snippet item stored in database.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: i64,
    pub content: String,
    pub alias: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Get all snippets ordered by most recently updated.
pub fn get_snippets(conn: &Connection) -> Result<Vec<Snippet>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, content, alias, created_at, updated_at FROM snippets ORDER BY updated_at DESC",
    )?;

    let items = stmt
        .query_map([], |row| {
            Ok(Snippet {
                id: row.get(0)?,
                content: row.get(1)?,
                alias: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(items)
}

/// Add a new snippet.
///
/// Returns the created Snippet with its assigned ID.
pub fn add_snippet(
    conn: &Connection,
    content: &str,
    alias: Option<&str>,
) -> Result<Snippet, rusqlite::Error> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    conn.execute(
        "INSERT INTO snippets (content, alias, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (content, alias, &now, &now),
    )?;

    let id = conn.last_insert_rowid();
    crate::logger::debug("Snippets", &format!("Added snippet id={}", id));

    Ok(Snippet {
        id,
        content: content.to_string(),
        alias: alias.map(|s| s.to_string()),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Update an existing snippet.
///
/// Returns true if the snippet was updated, false if not found.
pub fn update_snippet(
    conn: &Connection,
    id: i64,
    content: &str,
    alias: Option<&str>,
) -> Result<bool, rusqlite::Error> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let affected = conn.execute(
        "UPDATE snippets SET content = ?, alias = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![content, alias, &now, id],
    )?;

    Ok(affected > 0)
}

/// Delete a snippet by ID.
///
/// Returns true if a snippet was deleted, false if not found.
pub fn delete_snippet(conn: &Connection, id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute("DELETE FROM snippets WHERE id = ?", [id])?;
    Ok(affected > 0)
}

/// Create the snippets table if it doesn't exist (internal helper for tests).
fn create_table_sql(conn: &Connection) -> Result<(), rusqlite::Error> {
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
    Ok(())
}#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Create an in-memory database with snippets table
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory DB");
        create_table_sql(&conn).expect("Failed to create snippets table");
        conn
    }

    #[test]
    fn test_add_snippet_without_alias() {
        let conn = setup_test_db();

        let snippet = add_snippet(&conn, "docker exec -it container bash", None)
            .expect("Failed to add snippet");

        assert!(snippet.id > 0);
        assert_eq!(snippet.content, "docker exec -it container bash");
        assert!(snippet.alias.is_none());
        assert!(!snippet.created_at.is_empty());
        assert!(!snippet.updated_at.is_empty());
    }

    #[test]
    fn test_add_snippet_with_alias() {
        let conn = setup_test_db();

        let snippet = add_snippet(&conn, "docker exec -it container bash", Some("Docker bash"))
            .expect("Failed to add snippet");

        assert!(snippet.id > 0);
        assert_eq!(snippet.content, "docker exec -it container bash");
        assert_eq!(snippet.alias, Some("Docker bash".to_string()));
    }

    #[test]
    fn test_get_snippets_empty() {
        let conn = setup_test_db();

        let snippets = get_snippets(&conn).expect("Failed to get snippets");
        assert!(snippets.is_empty());
    }

    #[test]
    fn test_get_snippets_ordered_by_updated_at() {
        let conn = setup_test_db();

        // Add snippets with delays to ensure different timestamps (1 second precision)
        let snippet1 = add_snippet(&conn, "command1", Some("First")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let snippet2 = add_snippet(&conn, "command2", Some("Second")).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        let snippet3 = add_snippet(&conn, "command3", Some("Third")).unwrap();

        let snippets = get_snippets(&conn).expect("Failed to get snippets");

        assert_eq!(snippets.len(), 3);
        // Should be ordered by updated_at DESC (newest first)
        assert_eq!(snippets[0].id, snippet3.id);
        assert_eq!(snippets[1].id, snippet2.id);
        assert_eq!(snippets[2].id, snippet1.id);
    }

    #[test]
    fn test_update_snippet_content() {
        let conn = setup_test_db();

        let original = add_snippet(&conn, "original command", Some("Original"))
            .expect("Failed to add snippet");

        // Small delay to ensure updated_at is different
        std::thread::sleep(std::time::Duration::from_millis(10));

        let updated = update_snippet(&conn, original.id, "updated command", Some("Updated"))
            .expect("Failed to update snippet");

        assert!(updated);

        let snippets = get_snippets(&conn).expect("Failed to get snippets");
        assert_eq!(snippets.len(), 1);
        assert_eq!(snippets[0].content, "updated command");
        assert_eq!(snippets[0].alias, Some("Updated".to_string()));
    }

    #[test]
    fn test_update_snippet_clear_alias() {
        let conn = setup_test_db();

        let original = add_snippet(&conn, "command", Some("Alias"))
            .expect("Failed to add snippet");

        let updated = update_snippet(&conn, original.id, "command", None)
            .expect("Failed to update snippet");

        assert!(updated);

        let snippets = get_snippets(&conn).expect("Failed to get snippets");
        assert_eq!(snippets[0].alias, None);
    }

    #[test]
    fn test_update_nonexistent_snippet() {
        let conn = setup_test_db();

        let updated = update_snippet(&conn, 999, "command", None)
            .expect("Failed to execute update");

        assert!(!updated); // Should return false for non-existent snippet
    }

    #[test]
    fn test_delete_snippet() {
        let conn = setup_test_db();

        let snippet = add_snippet(&conn, "command to delete", Some("Delete me"))
            .expect("Failed to add snippet");

        let deleted = delete_snippet(&conn, snippet.id).expect("Failed to delete snippet");
        assert!(deleted);

        let snippets = get_snippets(&conn).expect("Failed to get snippets");
        assert!(snippets.is_empty());
    }

    #[test]
    fn test_delete_nonexistent_snippet() {
        let conn = setup_test_db();

        let deleted = delete_snippet(&conn, 999).expect("Failed to execute delete");
        assert!(!deleted); // Should return false for non-existent snippet
    }

    #[test]
    fn test_add_multiple_snippets() {
        let conn = setup_test_db();

        add_snippet(&conn, "cmd1", Some("Alias 1")).unwrap();
        add_snippet(&conn, "cmd2", Some("Alias 2")).unwrap();
        add_snippet(&conn, "cmd3", None).unwrap();
        add_snippet(&conn, "cmd4", Some("Alias 4")).unwrap();

        let snippets = get_snippets(&conn).expect("Failed to get snippets");
        assert_eq!(snippets.len(), 4);
    }

    #[test]
    fn test_snippet_with_unicode_content() {
        let conn = setup_test_db();

        let content = "echo '你好世界 🌍'";
        let alias = "中文命令";

        let snippet = add_snippet(&conn, content, Some(alias))
            .expect("Failed to add snippet with unicode");

        assert_eq!(snippet.content, content);
        assert_eq!(snippet.alias, Some(alias.to_string()));
    }

    #[test]
    fn test_snippet_with_long_content() {
        let conn = setup_test_db();

        let long_content = "x".repeat(10000);
        let snippet = add_snippet(&conn, &long_content, Some("Long command"))
            .expect("Failed to add snippet with long content");

        assert_eq!(snippet.content.len(), 10000);
    }

    #[test]
    fn test_snippet_with_special_characters() {
        let conn = setup_test_db();

        let content = "echo \"hello $USER\" && cat /etc/passwd | grep root";
        let alias = "Special 'chars' \"test\"";

        let snippet = add_snippet(&conn, content, Some(alias))
            .expect("Failed to add snippet with special chars");

        assert_eq!(snippet.content, content);
        assert_eq!(snippet.alias, Some(alias.to_string()));
    }

    #[test]
    fn test_snippet_with_newlines() {
        let conn = setup_test_db();

        let content = "line1\nline2\nline3";
        let snippet = add_snippet(&conn, content, None)
            .expect("Failed to add snippet with newlines");

        assert_eq!(snippet.content, content);
    }
}
