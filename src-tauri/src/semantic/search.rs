//! In-memory vector index for semantic search
//!
//! Uses parallel arrays for CPU cache efficiency during similarity search.
//! Supports O(1) upsert/remove and O(n) search with partial sorting.
//! Implements LRU eviction to prevent unbounded memory growth.

use std::collections::{HashMap, VecDeque};

use crate::config::{EMBEDDING_DIM, MAX_EMBEDDINGS_IN_MEMORY, MIN_SIMILARITY_SCORE};

/// Result item from semantic search
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub item_id: i64,
    pub score: f32,
}

/// In-memory embedding index with LRU eviction.
///
/// Memory layout is optimized for CPU cache efficiency:
/// - `item_ids` and `embeddings` are parallel arrays
/// - Embeddings are stored flat (not vec of vecs)
/// - HashMap provides O(1) item lookup
/// - LRU queue prevents unbounded memory growth
pub struct EmbeddingIndex {
    /// Embedding dimension
    dim: usize,
    /// Maximum items to keep in memory
    max_items: usize,
    /// Minimum similarity score for search results
    min_score: f32,
    /// Item IDs parallel to embeddings
    item_ids: Vec<i64>,
    /// Flattened embeddings: len = item_ids.len() * dim
    embeddings: Vec<f32>,
    /// Quick lookup from item_id to index
    id_to_idx: HashMap<i64, usize>,
    /// LRU queue for eviction (front = oldest, back = newest)
    lru_queue: VecDeque<i64>,
}

impl EmbeddingIndex {
    /// Create a new empty index with default configuration.
    pub fn new(dim: usize) -> Self {
        Self::with_config(dim, MAX_EMBEDDINGS_IN_MEMORY, MIN_SIMILARITY_SCORE)
    }

    /// Create a new index with custom configuration.
    pub fn with_config(dim: usize, max_items: usize, min_score: f32) -> Self {
        Self {
            dim,
            max_items,
            min_score,
            item_ids: Vec::new(),
            embeddings: Vec::new(),
            id_to_idx: HashMap::new(),
            lru_queue: VecDeque::new(),
        }
    }

    /// Add or update an embedding for an item.
    ///
    /// - Update: O(1) - just copy over existing slot
    /// - Insert: O(1) amortized - append to end
    /// - Eviction: O(n) worst case when LRU triggers
    pub fn upsert(&mut self, item_id: i64, embedding: &[f32]) {
        debug_assert_eq!(
            embedding.len(),
            self.dim,
            "Embedding dimension mismatch: expected {}, got {}",
            self.dim,
            embedding.len()
        );

        if let Some(&idx) = self.id_to_idx.get(&item_id) {
            // Update existing: copy into slot and move to end of LRU
            let start = idx * self.dim;
            self.embeddings[start..start + self.dim].copy_from_slice(embedding);

            // Move to most recently used
            self.lru_queue.retain(|&id| id != item_id);
            self.lru_queue.push_back(item_id);
        } else {
            // Check if we need to evict
            while self.item_ids.len() >= self.max_items {
                self.evict_lru();
            }

            // Insert new: append
            let idx = self.item_ids.len();
            self.item_ids.push(item_id);
            self.embeddings.extend_from_slice(embedding);
            self.id_to_idx.insert(item_id, idx);
            self.lru_queue.push_back(item_id);
        }
    }

    /// Evict the least recently used item.
    fn evict_lru(&mut self) {
        if let Some(old_id) = self.lru_queue.pop_front() {
            self.remove(old_id);
        }
    }

    /// Remove an item from the index.
    ///
    /// Uses swap-with-last trick for O(1) removal.
    pub fn remove(&mut self, item_id: i64) -> bool {
        let Some(idx) = self.id_to_idx.remove(&item_id) else {
            return false;
        };

        let last_idx = self.item_ids.len() - 1;

        if idx != last_idx {
            // Move last item to removed slot
            let last_id = self.item_ids[last_idx];
            self.item_ids[idx] = last_id;
            self.id_to_idx.insert(last_id, idx);

            // Copy embedding data
            let start = idx * self.dim;
            let last_start = last_idx * self.dim;
            self.embeddings
                .copy_within(last_start..last_start + self.dim, start);
        }

        // Remove last element
        self.item_ids.pop();
        self.embeddings.truncate(self.embeddings.len() - self.dim);

        // Remove from LRU queue
        self.lru_queue.retain(|&id| id != item_id);

        true
    }

    /// Search for top-K most similar items.
    ///
    /// Uses dot product (equals cosine similarity for normalized vectors).
    /// Results are filtered by MIN_SIMILARITY_SCORE threshold.
    /// Returns results sorted by score descending (highest similarity first).
    ///
    /// Time complexity: O(n) for scoring + O(k log k) for sorting top K
    pub fn search(&self, query: &[f32], k: usize) -> Vec<SearchResult> {
        debug_assert_eq!(
            query.len(),
            self.dim,
            "Query dimension mismatch: expected {}, got {}",
            self.dim,
            query.len()
        );

        if self.item_ids.is_empty() || k == 0 {
            return Vec::new();
        }

        // Calculate all similarities and filter by threshold
        let mut scores: Vec<(i64, f32)> = self
            .item_ids
            .iter()
            .enumerate()
            .map(|(idx, &item_id)| {
                let start = idx * self.dim;
                let embedding = &self.embeddings[start..start + self.dim];
                (item_id, dot_product(query, embedding))
            })
            .filter(|(_, score)| *score >= self.min_score)
            .collect();

        if scores.is_empty() {
            return Vec::new();
        }

        // Get top K by partial sort
        let k = k.min(scores.len());
        if k > 0 && k < scores.len() {
            scores.select_nth_unstable_by(k - 1, |a, b| {
                b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        // Truncate to top K
        scores.truncate(k);

        // Sort by score descending (highest similarity first)
        scores.sort_by(|a, b| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
        });

        // Convert to results
        scores
            .into_iter()
            .map(|(item_id, score)| SearchResult { item_id, score })
            .collect()
    }

    /// Get the number of indexed items.
    pub fn len(&self) -> usize {
        self.item_ids.len()
    }

    /// Check if index is empty.
    pub fn is_empty(&self) -> bool {
        self.item_ids.is_empty()
    }

    /// Clear all indexed items.
    pub fn clear(&mut self) {
        self.item_ids.clear();
        self.embeddings.clear();
        self.id_to_idx.clear();
        self.lru_queue.clear();
    }

    /// Check if an item exists in the index.
    pub fn contains(&self, item_id: i64) -> bool {
        self.id_to_idx.contains_key(&item_id)
    }

    /// Get memory usage in bytes.
    pub fn memory_usage(&self) -> usize {
        // item_ids: i64 = 8 bytes each
        // embeddings: f32 = 4 bytes each
        // HashMap overhead is approximate
        let ids_size = self.item_ids.len() * 8;
        let embeddings_size = self.embeddings.len() * 4;
        let lru_size = self.lru_queue.len() * 8 + 32; // VecDeque overhead
        let hashmap_size = self.id_to_idx.len() * 24; // rough estimate
        ids_size + embeddings_size + lru_size + hashmap_size
    }

    /// Get the maximum capacity.
    pub fn capacity(&self) -> usize {
        self.max_items
    }
}

impl Default for EmbeddingIndex {
    fn default() -> Self {
        Self::new(EMBEDDING_DIM)
    }
}

/// Calculate dot product of two vectors.
///
/// Optimized for small vectors (256 dimensions) where auto-vectorization
/// works well. For larger vectors, consider using SIMD explicitly.
#[inline]
fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_upsert_and_search() {
        let mut index = EmbeddingIndex::with_config(3, 100, 0.0); // No threshold

        // Add orthogonal vectors
        index.upsert(1, &[1.0, 0.0, 0.0]);
        index.upsert(2, &[0.0, 1.0, 0.0]);
        index.upsert(3, &[0.0, 0.0, 1.0]);

        // Search for [1, 0, 0]
        let results = index.search(&[1.0, 0.0, 0.0], 3);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].item_id, 1);
        assert!((results[0].score - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_update_moves_to_lru_tail() {
        let mut index = EmbeddingIndex::with_config(2, 3, 0.0);

        index.upsert(1, &[1.0, 0.0]);
        index.upsert(2, &[0.0, 1.0]);
        index.upsert(3, &[1.0, 1.0]);

        // Update item 1 (should move to tail)
        index.upsert(1, &[0.5, 0.5]);

        // Add new item (should evict item 2, not item 1)
        index.upsert(4, &[0.0, 0.0]);

        assert!(index.contains(1));
        assert!(!index.contains(2)); // Evicted
        assert!(index.contains(3));
        assert!(index.contains(4));
    }

    #[test]
    fn test_lru_eviction() {
        let mut index = EmbeddingIndex::with_config(2, 3, 0.0);

        index.upsert(1, &[1.0, 0.0]);
        index.upsert(2, &[0.0, 1.0]);
        index.upsert(3, &[1.0, 1.0]);

        // Adding 4th item should evict 1 (LRU)
        index.upsert(4, &[0.5, 0.5]);

        assert_eq!(index.len(), 3);
        assert!(!index.contains(1));
        assert!(index.contains(4));
    }

    #[test]
    fn test_search_filters_by_threshold() {
        let mut index = EmbeddingIndex::with_config(2, 100, 0.5);

        index.upsert(1, &[1.0, 0.0]); // Will match query with score 1.0
        index.upsert(2, &[0.6, 0.8]); // Will match query with score ~0.6
        index.upsert(3, &[0.0, 1.0]); // Will NOT match query (score 0.0)

        let results = index.search(&[1.0, 0.0], 10);
        assert_eq!(results.len(), 2); // Only items 1 and 2 pass threshold
        assert!(results.iter().all(|r| r.item_id != 3));
    }

    #[test]
    fn test_search_returns_empty_when_no_matches() {
        let mut index = EmbeddingIndex::with_config(2, 100, 0.9);

        index.upsert(1, &[0.5, 0.5]);
        index.upsert(2, &[0.6, 0.6]);

        // Query that doesn't match anything above threshold
        let results = index.search(&[1.0, 0.0], 10);
        assert!(results.is_empty());
    }

    #[test]
    fn test_update_existing() {
        let mut index = EmbeddingIndex::with_config(2, 100, 0.0); // No threshold

        index.upsert(1, &[1.0, 0.0]);
        index.upsert(1, &[0.0, 1.0]); // Update

        assert_eq!(index.len(), 1);

        let results = index.search(&[0.0, 1.0], 1);
        assert_eq!(results[0].item_id, 1);
        assert!((results[0].score - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_remove() {
        let mut index = EmbeddingIndex::with_config(2, 100, 0.0); // No threshold

        index.upsert(1, &[1.0, 0.0]);
        index.upsert(2, &[0.0, 1.0]);
        index.upsert(3, &[1.0, 1.0]);

        assert_eq!(index.len(), 3);

        assert!(index.remove(2));
        assert_eq!(index.len(), 2);
        assert!(!index.contains(2));

        let results = index.search(&[0.0, 1.0], 10);
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.item_id != 2));
    }

    #[test]
    fn test_remove_nonexistent() {
        let mut index = EmbeddingIndex::new(2);
        index.upsert(1, &[1.0, 0.0]);

        assert!(!index.remove(999));
        assert_eq!(index.len(), 1);
    }

    #[test]
    fn test_search_empty() {
        let index = EmbeddingIndex::new(3);
        let results = index.search(&[1.0, 0.0, 0.0], 5);
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_k_larger_than_size() {
        let mut index = EmbeddingIndex::with_config(2, 100, 0.0);
        index.upsert(1, &[1.0, 0.0]);
        index.upsert(2, &[0.0, 1.0]);

        let results = index.search(&[1.0, 1.0], 100);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_clear() {
        let mut index = EmbeddingIndex::new(2);
        index.upsert(1, &[1.0, 0.0]);
        index.upsert(2, &[0.0, 1.0]);

        index.clear();

        assert!(index.is_empty());
        assert_eq!(index.len(), 0);
    }

    #[test]
    fn test_memory_usage() {
        let mut index = EmbeddingIndex::new(256);
        index.upsert(1, &[0.0; 256]);
        index.upsert(2, &[0.0; 256]);

        let usage = index.memory_usage();
        // 2 items * 8 bytes (i64) + 2 * 256 * 4 bytes (f32) = 16 + 2048 = 2064
        assert!(usage >= 2064);
    }

    #[test]
    fn test_capacity() {
        let index = EmbeddingIndex::with_config(2, 1000, 0.5);
        assert_eq!(index.capacity(), 1000);
    }

    #[test]
    fn test_search_results_sorted_by_score_descending() {
        let mut index = EmbeddingIndex::with_config(2, 100, 0.0);

        // Add items with different similarities to query [1, 0]
        index.upsert(1, &[0.9, 0.0]);  // score: 0.9
        index.upsert(2, &[0.3, 0.0]);  // score: 0.3
        index.upsert(3, &[1.0, 0.0]);  // score: 1.0 (highest)
        index.upsert(4, &[0.5, 0.0]);  // score: 0.5
        index.upsert(5, &[0.7, 0.0]);  // score: 0.7

        let results = index.search(&[1.0, 0.0], 10);

        // Verify results are sorted by score descending
        assert_eq!(results.len(), 5);
        assert_eq!(results[0].item_id, 3); // score 1.0
        assert_eq!(results[1].item_id, 1); // score 0.9
        assert_eq!(results[2].item_id, 5); // score 0.7
        assert_eq!(results[3].item_id, 4); // score 0.5
        assert_eq!(results[4].item_id, 2); // score 0.3

        // Verify scores are descending
        for i in 0..results.len() - 1 {
            assert!(results[i].score >= results[i + 1].score);
        }
    }
}
