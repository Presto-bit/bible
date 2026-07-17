# RAG 与向量库设计

> 版本：v1.1  
> 参考项目：`/Users/mark/minimax_aipodcast`  
> 核心文件：`rag_core.py`、`note_rag_service.py`、`note_rag_profile.py`、`00201_note_rag.sql`

---

## 1. 设计目标

为圣经 App 的 **资源指南** 与 **AI 助手** 提供可溯源检索：

- 上传注释/教材 → 分块 → Embedding → 持久化向量表
- 用户在读 `约翰福音 3:16` 提问 → **经文章节过滤** + 混合检索 → Top-K 片段 → LLM 生成 + 引用卡片

---

## 2. 借鉴 minimax_aipodcast 的能力

| 能力 | minimax 实现 | Bible App 适配 |
|------|--------------|----------------|
| 文本分块 | `split_text_into_chunks`：Markdown 标题 → 段落 → 定长+重叠 | 注释 MD 同逻辑；PDF 用结构化 segments |
| 结构化分块 | `split_segments_into_chunks_with_meta`：表格/列表不截断行 | 注释中的表格、经文列表同理 |
| 混合检索 | 关键词 + Embedding 余弦，默认 0.45/0.55 | 同权重；中文 bigram 分词已内置 |
| 入库策略 | `per_shard` / `per_chapter` / `head_tail` | **`per_chapter` 为主**（按圣经书卷章） |
| 向量表 | `note_rag_chunks`（embedding JSONB + chunk_meta） | `bible_rag_chunks` |
| 分层 RAG | 摘要 + 向量 Top-K | 书卷摘要 + 章节检索 + 经节过滤 |
| 多查询 | `decompose_retrieval_queries` | 用户追问拆句多路检索 |
| 跨资料均衡 | 多篇笔记轮询取块 | 多本注释轮询，避免单书占满 |
| 检索缓存 | L1 内存 + L2 Redis | 同经节+同问题短 TTL 缓存 |
| Embedding | `EmbeddingProvider` 多后端 | scenario=`bible_commentary` |

---

## 3. 整体流水线

```mermaid
flowchart LR
    Upload["上传注释 PDF/MD"]
    Parse["解析 + 分段 segments"]
    Chunk["rag_core 分块 + meta"]
    Tag["打 scripture_refs 标签"]
    Select["per_chapter 选取入库块"]
    Embed["EmbeddingProvider"]
  Store["bible_rag_chunks"]
    Query["用户问题 + 经节 ref"]
    Filter["元数据过滤 book/chapter"]
    Hybrid["关键词 + 向量混合打分"]
    TopK["Top-K + 多注释均衡"]
    LLM["五种模式 Prompt"]
    Out["流式回答 + citations"]

    Upload --> Parse --> Chunk --> Tag --> Select --> Embed --> Store
    Query --> Filter --> Hybrid --> TopK --> LLM --> Out
    Store --> Hybrid
```

---

## 4. 分块策略

### 4.1 默认参数（注释类，参考 `note_rag_profile` short 档）

| 参数 | 默认值 | 环境变量 |
|------|--------|----------|
| `max_chunk_chars` | 900 | `RAG_CHUNK_CHARS` |
| `overlap` | 70 | `RAG_CHUNK_OVERLAP` |
| PDF 长文 | 900 / 60 | `RAG_CHUNK_CHARS_PDF` |
| 短篇 (<2万字) | 900 / 70 | `RAG_CHUNK_CHARS_SHORT` |

### 4.2 分块逻辑（直接复用 `rag_core`）

1. 有 Markdown `##` 标题 → 按标题切段后再按长度切
2. 否则按空行分段
3. 单段超长 → 滑动窗口，`overlap` 避免句断在边界
4. 表格按行切、列表按项合并

### 4.3 Bible 专用 `chunk_meta`

```json
{
  "document_id": "john-commentary-v1",
  "document_title": "约翰福音注释",
  "page": 42,
  "block_type": "paragraph",
  "scripture_refs": [
    { "book": "JHN", "chapter": 3, "verse_start": 16, "verse_end": 21 }
  ],
  "book": "JHN",
  "chapter": 3,
  "chapter_id": "JHN_3",
  "shard_id": "john-commentary",
  "language": "zh"
}
```

**`scripture_refs`** 是圣经 App 的核心过滤字段，minimax 的 `chapter_id` / `shard_id` 模式可直接映射为 **书卷 + 章**。

---

## 5. 入库策略

沿用 `select_chunks_for_index`，默认：

```bash
BIBLE_RAG_INDEX_STRATEGY=per_chapter
NOTE_RAG_PER_CHAPTER_MIN_CHUNKS=2
NOTE_RAG_MAX_CHUNKS_ABS=512
```

| 策略 | 适用 |
|------|------|
| **per_chapter**（推荐） | 每章至少 2 块入库，再均匀分配额度；保证约翰福音 3 章必有向量 |
| per_shard | 按整本注释书（shard）头尾+均匀采样 |
| head_tail | 超长单文件兜底 |

---

## 6. 检索策略

### 6.1 查询构建

```python
def build_bible_retrieval_query(
    scripture_ref: str,      # "JHN 3:16"
    mode: str,               # understand | explain | apply | compare | original
    user_question: str,
) -> str:
    # 拼接：经节原文（新译本）+ 模式关键词 + 用户问题
```

可选：`decompose_retrieval_queries(user_question)` 拆成最多 3 子查询，多向量 max-pool。

### 6.2 混合打分（复用 `apply_hybrid_vector_rag` 逻辑）

```
combined_score = w_k * norm(keyword_score) + w_v * norm(cosine_sim)
默认 w_k=0.45, w_v=0.55
```

### 6.3 经节过滤（Bible 增强，minimax 无）

检索候选池先过滤：

```sql
WHERE chunk_meta->'scripture_refs' @> '[{"book":"JHN","chapter":3}]'
   OR chunk_meta->>'chapter_id' = 'JHN_3'
```

无命中时放宽到 **整卷书** → 再放宽到 **全库**（并标注「资料库中本章暂无，以下为相关书卷」）。

### 6.4 模式过滤（软偏好）

| 模式 | 优先 `block_type` / 标签 |
|------|--------------------------|
| 理解 | background, overview |
| 解释 | commentary, theology |
| 应用 | devotional, application |
| 对照 | translation_note |
| 原文 | lexicon, word_study |

### 6.5 Top-K 与资源指南

| 场景 | top_k | max_chars |
|------|-------|-----------|
| 资源指南（不经过 LLM） | 5 | 2000 |
| 圣经半屏 AI | 5 | 4000 |
| 助手 Tab 完整 | 8 | 8000 |

多本文献时：**轮询各 `document_id` 最高分块**，避免单本注释垄断（复用 minimax 跨笔记均衡逻辑）。

---

## 7. 数据库表（适配 `00201_note_rag.sql`）

```sql
-- infra/postgres/init/001_bible_rag.sql

CREATE TABLE IF NOT EXISTS bible_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,  -- pdf | markdown
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rag_body_hash TEXT,
  rag_embedding_sig TEXT,
  rag_index_error TEXT,
  rag_index_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bible_rag_chunks (
  document_id UUID NOT NULL REFERENCES bible_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding JSONB NOT NULL,
  chunk_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_bible_rag_chunks_doc ON bible_rag_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_bible_rag_chunks_meta ON bible_rag_chunks USING gin (chunk_meta);
```

二期可加 `pgvector` 列替代 JSONB 余弦自算。

---

## 8. 索引任务（对齐 note_rag_service）

```
上传文档 → bible_documents.status = pending
    → RQ/Celery 或后台任务：
        1. 解析正文 content_text
        2. detect_chapters / 打 scripture_refs（可 LLM+规则辅助）
        3. split_segments_into_chunks_with_meta
        4. select_chunks_for_index (per_chapter)
        5. EmbeddingProvider.embed_documents
        6. INSERT bible_rag_chunks
        7. status = ready, rag_index_at = now()
```

失败写入 `rag_index_error`；`rag_embedding_sig` 变更时触发重建。

---

## 9. 资源指南 vs AI

| | 资源指南 | AI |
|--|----------|------|
| 检索 | 同 `bible_rag_chunks` | 同表 + 强制注入用户选中的 chunk_id |
| 生成 | **无 LLM**，原文展示 | LLM 流式 |
| API | `GET /guide/passage?ref=JHN.3.16` | `POST /ai/chat` |

---

## 10. 实现路线图

### Phase 1
- 移植 `rag_core.py` → `services/api/app/rag/core.py`
- `001_bible_rag.sql` + `scripts/rag_index.py`
- 单本注释 MD 手工标 `scripture_refs`
- 资源指南 API + 助手「理解」模式

### Phase 2
- PDF 解析 segments
- `per_chapter` 自动标签（规则 + LLM）
- 检索缓存、多文档均衡
- 五种模式分 prompt

### Phase 3
- pgvector 迁移
- 用户上传私有资料库（登录后）——**产品暂缓**（`PRODUCT.md` §6.7.2：当前只做平台+专题库选库；我的库另议重启）

---

## 11. 环境变量一览

```bash
# 切块
RAG_CHUNK_CHARS=900
RAG_CHUNK_OVERLAP=70
BIBLE_RAG_INDEX_STRATEGY=per_chapter
NOTE_RAG_PER_CHAPTER_MIN_CHUNKS=2
NOTE_RAG_MAX_CHUNKS_ABS=512

# 混合检索
RAG_HYBRID_VECTOR_WEIGHT=0.55
RAG_HYBRID_KEYWORD_WEIGHT=0.45

# Embedding（与 minimax 相同模式）
RAG_EMBEDDING_API_KEY=
RAG_EMBEDDING_BASE_URL=
RAG_EMBEDDING_MODEL=

# 摘要（书卷级，可选）
NOTE_RAG_SUMMARY_INPUT_CAP=44000
NOTE_LAYERED_RAG=1
```

---

## 12. 延迟优化（v1.1）

> 目标：把「问小爱」的端到端延迟压到 **感知秒回**。一次提问的耗时分布与瓶颈如下。

### 12.1 耗时分布与瓶颈

| 阶段 | 典型耗时 | 当前瓶颈 |
|------|----------|----------|
| Query 向量化 | 50–300ms | 每次提问调一次 embedding API（网络往返） |
| 向量召回 | 100ms–数秒 | **JSONB 自算余弦 O(N) 全候选扫描**，无 ANN 索引 |
| 元数据过滤 | 10–50ms | GIN 索引已有，影响小 |
| LLM 生成 | **1–5s（最大头）** | 非流式时用户需等全部生成完 |
| 多查询拆分 | ×2~3 | `decompose_retrieval_queries` 放大上述各步 |

**结论：** 感知速度由 **LLM 首 token 时间（TTFT）** 决定；召回慢主要因 **JSONB 余弦缺 ANN**。

### 12.2 缓存与预热（性价比最高，先做）

| 措施 | 规格 |
|------|------|
| **答案级缓存** | `ref + mode + question_hash` 命中 → 直接返回缓存答案，**0 次 LLM**；L1 内存 + L2 Redis；TTL 24h（与 PRODUCT §6.7 对齐） |
| **预生成（预读首答）** | 用户**进入某节阅读**时，后台静默对「解释这节」跑完整 RAG+LLM 写入缓存；点开小爱/半屏直接取（支撑前端「已预读这节 · 秒回」） |
| **检索结果缓存** | 同一 `ref` 的候选池 / Top-K chunk 缓存，跨不同问题复用召回，省过滤与部分 embedding |
| **资源指南不过 LLM** | 常见问题优先走「原文摘录」路径，秒出（§9） |

### 12.3 检索层提速

| 措施 | 规格 |
|------|------|
| **pgvector + HNSW** | 提前落地 §10 Phase 3：JSONB 自算余弦 O(N) → ANN 近似最近邻，召回数百 ms → 个位数 ms（召回端最大一次性收益） |
| **先过滤后算分** | 经节元数据过滤（GIN）**先于**向量计算，把候选池缩到数十条再打分 |
| **Query 向量缓存** | 高频问法 query 向量预先计算并缓存 |
| **降维 / 量化** | embedding 量化（int8）或降维，加速余弦、省内存 |
| **克制 decompose** | 默认单查询，仅复杂追问才多路；多路 **并发** 执行，不串行 |

### 12.4 生成层提速（决定体感）

| 措施 | 规格 |
|------|------|
| **流式输出（SSE）** | 优化首 token 时间，边生成边显示 |
| **先结论后依据** | prompt 让模型先一句话给结论再展开，配合流式秒见要点 |
| **模型分级路由** | 「理解 / 解释这节」走快/小模型；查经、讲道预备才用大模型 |
| **压输入压输出** | 半屏用压缩档（`top_k=5`、限 `max_tokens`）；精简注入 chunk 与系统提示 |
| **Prompt 缓存** | 系统提示 + 经文固定部分用 provider prompt caching |

### 12.5 工程层

| 措施 | 规格 |
|------|------|
| **常驻 worker 预热** | 避免冷启动连接 / 模型加载 |
| **并行化** | query 向量化与元数据过滤并行；「先回结论」与「取依据」并行 |
| **端侧兜底** | 每节高频问答（FAQ）打进经包，离线/弱网秒答常见问题 |
| **索引时多算** | 书卷摘要、经节↔chunk 映射、热门问答在入库阶段预计算 |

### 12.6 落地优先级

| 优先级 | 措施 | 收益 |
|--------|------|------|
| **P0** | 流式输出 + 先结论后依据 | 体感最快，改动小 |
| **P0** | 答案缓存 + 预读首答 | 高频问题直接秒回 |
| **P1** | pgvector HNSW 索引 | 召回端一次性大提速 |
| **P1** | 模型分级路由 | 简单问题省一半时间 |
| **P2** | query 向量缓存 / 量化 / 端侧 FAQ | 长尾与离线提速 |

### 12.7 新增环境变量

```bash
# 缓存
RAG_ANSWER_CACHE_TTL=86400         # 答案级缓存 24h
RAG_RETRIEVAL_CACHE_TTL=3600       # 检索结果缓存
RAG_PREWARM_ON_READ=1              # 进入经节阅读时预生成首答

# 向量索引
BIBLE_RAG_VECTOR_BACKEND=pgvector  # jsonb | pgvector
BIBLE_RAG_ANN_INDEX=hnsw           # hnsw | ivfflat
BIBLE_RAG_EMBED_QUANT=int8         # none | int8

# 生成
RAG_LLM_STREAM=1                   # 流式输出
RAG_LLM_FAST_MODEL=                # 简单意图快模型
RAG_LLM_DEEP_MODEL=                # 查经/讲道大模型
```

---

## 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PRODUCT.md](./PRODUCT.md) §6 AI 体系

---

## 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.1 | 2026-06-15 | §12 延迟优化：缓存/预读、pgvector ANN、流式分级、落地优先级 |
| v1.0 | 2026-06-15 | 基于 minimax_aipodcast 适配圣经场景 |
