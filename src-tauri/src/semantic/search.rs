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
    dim: usize,
    max_items: usize,
    item_ids: Vec<i64>,
    embeddings: Vec<f32>,
    id_to_idx: HashMap<i64, usize>,
    lru_queue: VecDeque<i64>,
}

impl EmbeddingIndex {
    pub fn new(dim: usize) -> Self {
        Self::with_config(dim, MAX_EMBEDDINGS_IN_MEMORY, MIN_SIMILARITY_SCORE)
    }

    pub fn with_config(dim: usize, max_items: usize, _min_score: f32) -> Self {
        Self {
            dim,
            max_items,
            item_ids: Vec::new(),
            embeddings: Vec::new(),
            id_to_idx: HashMap::new(),
            lru_queue: VecDeque::new(),
        }
    }

    pub fn upsert(&mut self, item_id: i64, embedding: &[f32]) {
        debug_assert_eq!(
            embedding.len(),
            self.dim,
            "Embedding dimension mismatch: expected {}, got {}",
            self.dim,
            embedding.len()
        );

        if let Some(&idx) = self.id_to_idx.get(&item_id) {
            let start = idx * self.dim;
            self.embeddings[start..start + self.dim].copy_from_slice(embedding);

            self.lru_queue.retain(|&id| id != item_id);
            self.lru_queue.push_back(item_id);
        } else {
            while self.item_ids.len() >= self.max_items {
                self.evict_lru();
            }

            let idx = self.item_ids.len();
            self.item_ids.push(item_id);
            self.embeddings.extend_from_slice(embedding);
            self.id_to_idx.insert(item_id, idx);
            self.lru_queue.push_back(item_id);
        }
    }

    fn evict_lru(&mut self) {
        if let Some(old_id) = self.lru_queue.pop_front() {
            let _ = self.remove(old_id);
        }
    }

    pub fn remove(&mut self, item_id: i64) -> bool {
        let Some(idx) = self.id_to_idx.remove(&item_id) else {
            return false;
        };

        let last_idx = self.item_ids.len() - 1;

        if idx != last_idx {
            let last_id = self.item_ids[last_idx];
            self.item_ids[idx] = last_id;
            self.id_to_idx.insert(last_id, idx);

            let start = idx * self.dim;
            let last_start = last_idx * self.dim;
            self.embeddings
                .copy_within(last_start..last_start + self.dim, start);
        }

        self.item_ids.pop();
        self.embeddings.truncate(self.embeddings.len() - self.dim);

        self.lru_queue.retain(|&id| id != item_id);

        true
    }

    pub fn clear(&mut self) {
        self.item_ids.clear();
        self.embeddings.clear();
        self.id_to_idx.clear();
        self.lru_queue.clear();
    }

    /// Returns the number of embeddings currently stored.
    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.item_ids.len()
    }

    /// Returns true if the index contains no embeddings.
    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.item_ids.is_empty()
    }

    /// Returns a reference to the internal embedding vector for similarity.
    pub fn get_embeddings(&self) -> &Vec<f32> {
        &self.embeddings
    }
        &self,
        query: &[f32],
        k: usize,
        min_score: f32,
    ) -> Vec<SearchResult> {
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

        let mut scores: Vec<(i64, f32)> = self
            .item_ids
            .iter()
            .enumerate()
            .map(|(idx, &item_id)| {
                let start = idx * self.dim;
                let embedding = &self.embeddings[start..start + self.dim];
                (item_id, dot_product(query, embedding))
            })
            .filter(|(_, score)| *score >= min_score)
            .collect();

        if scores.is_empty() {
            return Vec::new();
        }

        let k = k.min(scores.len());
        if k > 0 && k < scores.len() {
            scores.select_nth_unstable_by(k - 1, |a, b| {
                b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        scores.truncate(k);

        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        /*
        Block comment to prevent rustdoc from parsing the internal braces
        as part of the iterator.
        */
        scores
            .into_iter()
            .map(|(item_id, score)| SearchResult { item_id, score })
            .collect()
    }
}

impl Default for EmbeddingIndex {
    fn default() -> Self {
        Self::new(EMBEDDING_DIM)
    }
}

#[inline]
fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}
