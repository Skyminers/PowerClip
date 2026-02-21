# AI Semantic Search Module

本地语义搜索模块，使用 EmbeddingGemma-300M 模型实现剪贴板内容的语义搜索。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│  SemanticToggle.tsx    │  useSemanticSearch.ts  │  types.ts        │
│  - 状态显示/配置        │  - 搜索 Hook (防抖)    │  - 类型定义      │
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
│  │ 懒加载模型   │  │ LRU内存索引  │  │ 状态供前端查询       │       │
│  └──────────────┘  └──────────────┘  └──────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┬───────────────┐
     ▼               ▼               ▼               ▼
┌─────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
│ model   │   │ embedding │   │  search   │   │    db     │
│ 模型管理 │   │ 批量索引  │   │ LRU+阈值  │   │ 数据持久化│
└─────────┘   └───────────┘   └───────────┘   └───────────┘
```

## 数据流

### 搜索流程

```
用户输入查询
    │
    ▼
前端防抖 (300ms)
    │
    ▼
invoke('semantic_search', { query, limit })
    │
    ▼
┌─────────────────────────────────────┐
│ 1. 验证状态 (enabled, model_exists) │
│ 2. 懒加载模型 (首次搜索时)          │
│ 3. 计算查询向量 (tokenize → encode) │
│ 4. 内存索引搜索 (dot product)       │
│    └─ 过滤: score >= 0.3            │
│ 5. 从数据库获取完整条目             │
│ 6. 返回带相似度分数的结果           │
└─────────────────────────────────────┘
    │
    ▼
前端渲染结果
```

### 批量索引流程

```
启动/下载完成
    │
    ▼
index_all_items()
    │
    ├─► 查询未索引条目 (NOT EXISTS embeddings)
    │
    ├─► [计算线程] 逐条计算嵌入向量
    │       │
    │       ├─► 更新内存索引 (LRU)
    │       │
    │       └─► 累积到批次 (100条/批)
    │
    └─► [写入线程] 批量保存到数据库
            │
            └─► SQLite INSERT OR REPLACE
```

## 核心组件

### 1. SemanticState (mod.rs)

全局状态管理，使用 `Arc` 包装实现线程安全：

```rust
pub struct SemanticState {
    pub model: Arc<Mutex<Option<SemanticModel>>>,  // 懒加载
    pub index: Arc<RwLock<EmbeddingIndex>>,        // 读写锁
    pub status: Arc<RwLock<SemanticStatus>>,       // 状态查询
}
```

### 2. EmbeddingIndex (search.rs)

内存向量索引，支持 **LRU 淘汰** 和 **阈值过滤**：

```rust
pub struct EmbeddingIndex {
    dim: usize,                    // 向量维度 (256)
    max_items: usize,              // 最大容量 (50,000)
    min_score: f32,                // 最低相似度 (0.3)
    item_ids: Vec<i64>,            // ID 数组
    embeddings: Vec<f32>,          // 扁平化向量
    id_to_idx: HashMap<i64, usize>,// 快速查找
    lru_queue: VecDeque<i64>,      // LRU 队列
}
```

**特性**：
- **LRU 淘汰**：超过 `MAX_EMBEDDINGS_IN_MEMORY` 时自动淘汰最久未使用
- **阈值过滤**：只返回 `score >= MIN_SIMILARITY_SCORE` 的结果
- **O(n) 搜索**：线性扫描 + 部分排序 (select_nth_unstable)

### 3. 向量计算 (embedding.rs)

```
原始文本
    │
    ▼ tokenize (AddBos::Always)
Token 序列 (max 512)
    │
    ▼ encode (LlamaContext)
原始向量 (2560 维)
    │
    ▼ truncate (MRL)
截断向量 (256 维)
    │
    ▼ L2 normalize
归一化向量 (||v|| = 1)
```

**批量索引优化**：
- 独立数据库写入线程
- 批次大小：100 条/次
- 避免阻塞计算线程

### 4. 数据持久化 (db.rs)

```sql
CREATE TABLE embeddings (
    item_id INTEGER PRIMARY KEY,
    embedding BLOB NOT NULL,      -- little-endian f32[]
    dim INTEGER NOT NULL          -- 向量维度
);
```

## 配置 (config.rs)

| 常量 | 值 | 说明 |
|------|-----|------|
| `EMBEDDING_DIM` | 256 | MRL 截断后的向量维度 |
| `MAX_EMBEDDING_TOKENS` | 512 | 最大 token 数量 |
| `MIN_MODEL_SIZE_BYTES` | 100MB | 模型文件最小大小 |
| `MAX_EMBEDDINGS_IN_MEMORY` | 50,000 | 内存中最大嵌入数量 |
| `MIN_SIMILARITY_SCORE` | 0.3 | 最低相似度阈值 |
| `EMBEDDING_BATCH_SIZE` | 100 | 批量写入数据库大小 |
| `SEMANTIC_MODEL_FILENAME` | embeddinggemma-300m-Q8_0.gguf | 模型文件名 |

## 性能特性

### 内存使用

| 指标 | 计算 | 结果 |
|------|------|------|
| 单个向量 | 256 × 4 bytes | 1 KB |
| 最大容量 | 50,000 × 1 KB | ~50 MB |
| 模型加载 | - | ~500 MB |

### 搜索性能

- **复杂度**：O(n) 线性扫描 + O(k) 部分排序
- **1,000 条目**：< 1ms
- **10,000 条目**：< 10ms
- **50,000 条目**：< 50ms

### LRU 淘汰

```
插入第 50,001 条目时:
    │
    ▼
检查 LRU 队列头部 (最久未使用)
    │
    ▼
从内存索引移除
    │
    ▼
插入新条目到尾部
```

**注意**：数据库中保留所有嵌入，内存中仅淘汰。

### 批量写入优化

```
计算线程                    写入线程
    │                          │
    ├─ 计算嵌入 #1              │
    ├─ 计算嵌入 #2              │
    │   ...                    │
    ├─ 计算嵌入 #100            │
    │                          │
    ├─ 发送批次 ───────────────►│
    │                          ├─ 批量写入 DB
    ├─ 计算嵌入 #101            │
    │   ...                    │
```

## 扩展方向

### 更大规模数据 (> 100K 条目)

当前实现适用于中小规模。对于大规模数据：

1. **ANN 索引**：
   - HNSW (Hierarchical Navigable Small World)
   - IVF (Inverted File Index)
   - 权衡精度换取速度

2. **分片存储**：
   - 按时间分片
   - 冷热数据分离

### 高级特性

1. **查询缓存**：缓存热门查询的嵌入向量
2. **增量索引**：只索引新增/修改的内容
3. **多模型支持**：可配置不同的嵌入模型

## 文件清单

```
semantic/
├── mod.rs        # 模块入口，状态定义
├── commands.rs   # Tauri IPC 命令
├── model.rs      # 模型下载/加载
├── embedding.rs  # 向量计算/批量索引
├── search.rs     # LRU索引/阈值搜索
├── db.rs         # SQLite 操作
└── README.md     # 本文档
```

## 测试覆盖

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| search.rs | 13 | LRU淘汰、阈值过滤、增删查 |
| embedding.rs | 4 | L2归一化、边界条件 |
| db.rs | 1 | BLOB序列化 |
| **总计** | **18** | |
