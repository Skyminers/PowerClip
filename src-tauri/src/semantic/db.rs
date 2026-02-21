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
}
