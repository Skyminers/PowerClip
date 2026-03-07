//! Database operations for embeddings

use rusqlite::Connection;

use crate::config::EMBEDDING_DIM;
use crate::logger;

/// Save an embedding for an item
pub fn save_embedding(conn: &Connection, item_id: i64, embedding: &[f32]) -> Result<(), rusqlite::Error> {
    let dim = embedding.len() as i32;
    let bytes = embedding_to_blob(embedding);

    conn.execute(
        "INSERT OR REPLACE INTO embeddings (item_id, embedding, dim) VALUES (?1, ?2, ?3)",
        rusqlite::params![item_id, bytes, dim],
    )?;

    logger::debug("SemanticDB", &format!("Saved embedding for item {}", item_id));
    Ok(())
}

/// Get an embedding for an item
#[allow(dead_code)]
pub fn get_embedding(conn: &Connection, item_id: i64) -> Result<Option<Vec<f32>>, rusqlite::Error> {
    let result: Result<(Vec<u8>, i32), _> = conn.query_row(
        "SELECT embedding, dim FROM embeddings WHERE item_id = ?1",
        [item_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    );

    match result {
        Ok((blob, dim)) => {
            let embedding = blob_to_embedding(&blob, dim as usize);
            Ok(Some(embedding))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// Get all embeddings with their item IDs
pub fn get_all_embeddings(conn: &Connection) -> Result<Vec<(i64, Vec<f32>)>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT item_id, embedding, dim FROM embeddings"
    )?;

    let results = stmt.query_map([], |row| {
        let item_id: i64 = row.get(0)?;
        let blob: Vec<u8> = row.get(1)?;
        let dim: i32 = row.get(2)?;
        let embedding = blob_to_embedding(&blob, dim as usize);
        Ok((item_id, embedding))
    })?;

    let mut embeddings = Vec::new();
    for result in results {
        embeddings.push(result?);
    }

    Ok(embeddings)
}

/// Delete an embedding for an item
#[allow(dead_code)]
pub fn delete_embedding(conn: &Connection, item_id: i64) -> Result<bool, rusqlite::Error> {
    let affected = conn.execute(
        "DELETE FROM embeddings WHERE item_id = ?1",
        [item_id],
    )?;
    Ok(affected > 0)
}

/// Get count of embeddings
#[allow(dead_code)]
pub fn get_embedding_count(conn: &Connection) -> Result<usize, rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?;
    Ok(count as usize)
}

/// Clear all embeddings from the database
/// Use when embedding dimension changes or to force re-indexing
pub fn clear_all_embeddings(conn: &Connection) -> Result<usize, rusqlite::Error> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM embeddings", [], |row| row.get(0))?;
    conn.execute("DELETE FROM embeddings", [])?;
    logger::info("SemanticDB", &format!("Cleared {} embeddings from database", count));
    Ok(count as usize)
}

/// Convert embedding vector to BLOB (little-endian f32)
fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(embedding.len() * 4);
    for &v in embedding {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}

/// Convert BLOB to embedding vector
fn blob_to_embedding(blob: &[u8], dim: usize) -> Vec<f32> {
    let mut embedding = Vec::with_capacity(dim);
    for i in 0..dim {
        let start = i * 4;
        let end = start + 4;
        if end <= blob.len() {
            let arr: [u8; 4] = blob[start..end].try_into().unwrap_or([0; 4]);
            embedding.push(f32::from_le_bytes(arr));
        }
    }
    embedding
}

/// Load all embeddings from database into memory index
pub fn load_embeddings_into_index(
    conn: &Connection,
    index: &mut super::EmbeddingIndex,
) -> Result<usize, rusqlite::Error> {
    let embeddings = get_all_embeddings(conn)?;
    let count = embeddings.len();

    for (item_id, embedding) in embeddings {
        // Validate dimension
        if embedding.len() == EMBEDDING_DIM {
            index.upsert(item_id, &embedding);
        } else {
            logger::warning("SemanticDB", &format!(
                "Skipping item {} with wrong dimension: {} (expected {})",
                item_id, embedding.len(), EMBEDDING_DIM
            ));
        }
    }

    logger::info("SemanticDB", &format!("Loaded {} embeddings into index", count));
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Create an in-memory database with embeddings table
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory DB");
        conn.execute(
            "CREATE TABLE IF NOT EXISTS embeddings (
                item_id INTEGER PRIMARY KEY,
                embedding BLOB NOT NULL,
                dim INTEGER NOT NULL DEFAULT 256
            )",
            (),
        )
        .expect("Failed to create embeddings table");
        conn
    }

    #[test]
    fn test_embedding_blob_conversion() {
        let original: Vec<f32> = vec![1.0, -2.5, 0.001, 1000.0];
        let blob = embedding_to_blob(&original);
        let recovered = blob_to_embedding(&blob, original.len());

        assert_eq!(original.len(), recovered.len());
        for (a, b) in original.iter().zip(recovered.iter()) {
            assert!((a - b).abs() < 0.0001);
        }
    }

    #[test]
    fn test_embedding_to_blob_size() {
        let embedding: Vec<f32> = vec![0.0; 256];
        let blob = embedding_to_blob(&embedding);

        // Each f32 is 4 bytes
        assert_eq!(blob.len(), 256 * 4);
    }

    #[test]
    fn test_blob_to_embedding_partial_data() {
        // Test with blob larger than needed
        let blob: Vec<u8> = (0..20).collect(); // 20 bytes = 5 f32 values
        let embedding = blob_to_embedding(&blob, 3); // Request only 3

        assert_eq!(embedding.len(), 3);
    }

    #[test]
    fn test_blob_to_embedding_empty() {
        let blob: Vec<u8> = vec![];
        let embedding = blob_to_embedding(&blob, 0);

        assert!(embedding.is_empty());
    }

    #[test]
    fn test_save_embedding() {
        let conn = setup_test_db();

        let embedding: Vec<f32> = vec![1.0, 2.0, 3.0];
        let result = save_embedding(&conn, 1, &embedding);

        assert!(result.is_ok());
    }

    #[test]
    fn test_save_embedding_upsert() {
        let conn = setup_test_db();

        let embedding1: Vec<f32> = vec![1.0, 2.0, 3.0];
        let embedding2: Vec<f32> = vec![4.0, 5.0, 6.0];

        save_embedding(&conn, 1, &embedding1).expect("Failed to save first");
        save_embedding(&conn, 1, &embedding2).expect("Failed to save second");

        let retrieved = get_embedding(&conn, 1).expect("Failed to get embedding");
        assert!(retrieved.is_some());

        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.len(), 3);
        assert!((retrieved[0] - 4.0).abs() < 0.001);
    }

    #[test]
    fn test_get_embedding_existing() {
        let conn = setup_test_db();

        let embedding: Vec<f32> = vec![0.5, -0.5, 1.0];
        save_embedding(&conn, 42, &embedding).expect("Failed to save");

        let result = get_embedding(&conn, 42).expect("Failed to get");
        assert!(result.is_some());

        let retrieved = result.unwrap();
        assert_eq!(retrieved.len(), 3);
        assert!((retrieved[0] - 0.5).abs() < 0.001);
        assert!((retrieved[1] - (-0.5)).abs() < 0.001);
        assert!((retrieved[2] - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_get_embedding_nonexistent() {
        let conn = setup_test_db();

        let result = get_embedding(&conn, 999).expect("Failed to query");
        assert!(result.is_none());
    }

    #[test]
    fn test_get_all_embeddings_empty() {
        let conn = setup_test_db();

        let embeddings = get_all_embeddings(&conn).expect("Failed to get all");
        assert!(embeddings.is_empty());
    }

    #[test]
    fn test_get_all_embeddings_multiple() {
        let conn = setup_test_db();

        save_embedding(&conn, 1, &[1.0, 0.0]).expect("Failed to save");
        save_embedding(&conn, 2, &[0.0, 1.0]).expect("Failed to save");
        save_embedding(&conn, 3, &[1.0, 1.0]).expect("Failed to save");

        let embeddings = get_all_embeddings(&conn).expect("Failed to get all");
        assert_eq!(embeddings.len(), 3);

        let ids: Vec<i64> = embeddings.iter().map(|(id, _)| *id).collect();
        assert!(ids.contains(&1));
        assert!(ids.contains(&2));
        assert!(ids.contains(&3));
    }

    #[test]
    fn test_delete_embedding_existing() {
        let conn = setup_test_db();

        save_embedding(&conn, 1, &[1.0, 2.0]).expect("Failed to save");

        let deleted = delete_embedding(&conn, 1).expect("Failed to delete");
        assert!(deleted);

        let result = get_embedding(&conn, 1).expect("Failed to get");
        assert!(result.is_none());
    }

    #[test]
    fn test_delete_embedding_nonexistent() {
        let conn = setup_test_db();

        let deleted = delete_embedding(&conn, 999).expect("Failed to delete");
        assert!(!deleted);
    }

    #[test]
    fn test_get_embedding_count() {
        let conn = setup_test_db();

        assert_eq!(get_embedding_count(&conn).expect("Failed to count"), 0);

        save_embedding(&conn, 1, &[1.0]).expect("Failed to save");
        assert_eq!(get_embedding_count(&conn).expect("Failed to count"), 1);

        save_embedding(&conn, 2, &[2.0]).expect("Failed to save");
        assert_eq!(get_embedding_count(&conn).expect("Failed to count"), 2);
    }

    #[test]
    fn test_clear_all_embeddings() {
        let conn = setup_test_db();

        save_embedding(&conn, 1, &[1.0]).expect("Failed to save");
        save_embedding(&conn, 2, &[2.0]).expect("Failed to save");
        save_embedding(&conn, 3, &[3.0]).expect("Failed to save");

        let count = clear_all_embeddings(&conn).expect("Failed to clear");
        assert_eq!(count, 3);

        assert_eq!(get_embedding_count(&conn).expect("Failed to count"), 0);
    }

    #[test]
    fn test_clear_all_embeddings_empty() {
        let conn = setup_test_db();

        let count = clear_all_embeddings(&conn).expect("Failed to clear");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_load_embeddings_into_index() {
        let conn = setup_test_db();

        // Save some embeddings with the correct dimension
        let mut embedding1 = vec![0.0; EMBEDDING_DIM];
        embedding1[0] = 1.0;
        let mut embedding2 = vec![0.0; EMBEDDING_DIM];
        embedding2[1] = 1.0;

        save_embedding(&conn, 1, &embedding1).expect("Failed to save");
        save_embedding(&conn, 2, &embedding2).expect("Failed to save");

        let mut index = crate::semantic::EmbeddingIndex::new(EMBEDDING_DIM);
        let count = load_embeddings_into_index(&conn, &mut index).expect("Failed to load");

        assert_eq!(count, 2);
        assert_eq!(index.len(), 2);
    }
}
