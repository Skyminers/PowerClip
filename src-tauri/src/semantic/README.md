# AI Semantic Search Module

Local semantic search module using EmbeddingGemma-300M model for semantic search of clipboard content.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│  SemanticToggle.tsx    │  useSemanticSearch.ts  │  types.ts        │
│  - Status display      │  - Search Hook (debounce)│  - Type defs    │
└────────────────────┬────────────────────────────────────────────────┘
                     │ Tauri IPC (invoke)
┌────────────────────▼────────────────────────────────────────────────┐
│                      Tauri Commands (commands.rs)                    │
├─────────────────────────────────────────────────────────────────────┤
│  get_semantic_status  │  semantic_search  │  download_model         │
│  start_bulk_indexing  │  rebuild_index    │  cancel_model_download  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│                     SemanticState (mod.rs)                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐       │
│  │    Model     │  │    Index     │  │       Status         │       │
│  │ Arc<Mutex>   │  │ Arc<RwLock>  │  │   Arc<RwLock>        │       │
│  │ Lazy load    │  │ LRU index    │  │ Status for frontend  │       │
│  └──────────────┘  └──────────────┘  └──────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┬───────────────┐
     ▼               ▼               ▼               ▼
┌─────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│ model   │   │ embedding │   │  search   │   │    db     │
│ Model   │   │ Batch     │   │ LRU+      │   │ Data      │
│ mgmt    │   │ indexing  │   │ threshold │   │ persistence│
└─────────┘   └───────────┘   └───────────┘   └───────────┘
```

## Data Flow

### Search Flow

```
User enters query
    │
    ▼
Frontend debounce (300ms)
    │
    ▼
invoke('semantic_search', { query, limit })
    │
    ▼
┌─────────────────────────────────────┐
│ 1. Validate state (enabled, model)  │
│ 2. Lazy load model (first search)   │
│ 3. Compute query vector (tokenize)  │
│ 4. Memory index search (dot product)│
│    └─ Filter: score >= 0.2          │
│ 5. Fetch full items from database   │
│ 6. Return results with scores       │
└─────────────────────────────────────┘
    │
    ▼
Frontend renders results
```

### Batch Indexing Flow

```
Startup / Download complete
    │
    ▼
index_all_items()
    │
    ├─► Query unindexed items (NOT EXISTS embeddings)
    │
    ├─► [Compute thread] Calculate embeddings one by one
    │       │
    │       ├─► Update memory index (LRU)
    │       │
    │       └─► Accumulate into batch (100 items/batch)
    │
    └─► [Write thread] Batch save to database
            │
            └─► SQLite INSERT OR REPLACE
```

## Core Components

### 1. SemanticState (mod.rs)

Global state management with thread-safe `Arc` wrappers:

```rust
pub struct SemanticState {
    pub model: Arc<Mutex<Option<SemanticModel>>>,  // Lazy load
    pub index: Arc<RwLock<EmbeddingIndex>>,        // Read-write lock
    pub status: Arc<RwLock<SemanticStatus>>,       // Status query
}
```

### 2. EmbeddingIndex (search.rs)

In-memory vector index with **LRU eviction** and **threshold filtering**:

```rust
pub struct EmbeddingIndex {
    dim: usize,                    // Vector dimension (768)
    max_items: usize,              // Max capacity (50,000)
    min_score: f32,                // Min similarity (0.2)
    item_ids: Vec<i64>,            // ID array
    embeddings: Vec<f32>,          // Flattened vectors
    id_to_idx: HashMap<i64, usize>,// Fast lookup
    lru_queue: VecDeque<i64>,      // LRU queue
}
```

**Features**:
- **LRU Eviction**: Automatically evicts least recently used when exceeding `MAX_EMBEDDINGS_IN_MEMORY`
- **Threshold Filtering**: Only returns results with `score >= MIN_SIMILARITY_SCORE`
- **O(n) Search**: Linear scan + partial sort (select_nth_unstable)

### 3. Vector Computation (embedding.rs)

```
Raw text
    │
    ▼ tokenize (AddBos::Always)
Token sequence (max 512)
    │
    ▼ encode (LlamaContext)
Raw vector (2560 dims)
    │
    ▼ truncate (MRL)
Truncated vector (768 dims)
    │
    ▼ L2 normalize
Normalized vector (||v|| = 1)
```

**Batch Indexing Optimization**:
- Separate database write thread
- Batch size: 100 items/batch
- Avoids blocking compute thread

### 4. Data Persistence (db.rs)

```sql
CREATE TABLE embeddings (
    item_id INTEGER PRIMARY KEY,
    embedding BLOB NOT NULL,      -- little-endian f32[]
    dim INTEGER NOT NULL          -- Vector dimension
);
```

## Configuration (config.rs)

| Constant | Value | Description |
|----------|-------|-------------|
| `EMBEDDING_DIM` | 768 | Vector dimension after MRL truncation |
| `MAX_EMBEDDING_TOKENS` | 512 | Max token count |
| `MIN_MODEL_SIZE_BYTES` | 100MB | Minimum model file size |
| `MAX_EMBEDDINGS_IN_MEMORY` | 50,000 | Max embeddings in memory |
| `MIN_SIMILARITY_SCORE` | 0.2 | Minimum similarity threshold |
| `EMBEDDING_BATCH_SIZE` | 100 | Batch size for database writes |
| `SEMANTIC_MODEL_FILENAME` | embeddinggemma-300m-Q8_0.gguf | Model filename |

## Performance Characteristics

### Memory Usage

| Metric | Calculation | Result |
|--------|-------------|--------|
| Single vector | 768 × 4 bytes | ~3 KB |
| Max capacity | 50,000 × 3 KB | ~150 MB |
| Model loaded | - | ~500 MB |

### Search Performance

- **Complexity**: O(n) linear scan + O(k) partial sort
- **1,000 items**: < 1ms
- **10,000 items**: < 10ms
- **50,000 items**: < 50ms

### LRU Eviction

```
When inserting item 50,001:
    │
    ▼
Check LRU queue head (least recently used)
    │
    ▼
Remove from memory index
    │
    ▼
Insert new item at tail
```

**Note**: All embeddings are retained in database, only evicted from memory.

### Batch Write Optimization

```
Compute thread                   Write thread
    │                                │
    ├─ Compute embedding #1          │
    ├─ Compute embedding #2          │
    │   ...                          │
    ├─ Compute embedding #100        │
    │                                │
    ├─ Send batch ──────────────────►│
    │                                ├─ Batch write to DB
    ├─ Compute embedding #101        │
    │   ...                          │
```

## Future Improvements

### Larger Scale Data (> 100K items)

Current implementation is suitable for small to medium scale. For larger datasets:

1. **ANN Index**:
   - HNSW (Hierarchical Navigable Small World)
   - IVF (Inverted File Index)
   - Trade accuracy for speed

2. **Sharded Storage**:
   - Time-based sharding
   - Hot/cold data separation

### Advanced Features

1. **Query Cache**: Cache embeddings for popular queries
2. **Incremental Indexing**: Only index new/modified content
3. **Multi-model Support**: Configurable embedding models

## File Listing

```
semantic/
├── mod.rs        # Module entry, state definitions
├── commands.rs   # Tauri IPC commands
├── model.rs      # Model download/loading
├── embedding.rs  # Vector computation/batch indexing
├── search.rs     # LRU index/threshold search
├── db.rs         # SQLite operations
└── README.md     # This document
```

## Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| search.rs | 13 | LRU eviction, threshold filtering, CRUD |
| embedding.rs | 4 | L2 normalization, edge cases |
| db.rs | 1 | BLOB serialization |
| **Total** | **18** | |
