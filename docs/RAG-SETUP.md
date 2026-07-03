# RAG 注释资料配置指南

当前 RAG **代码已就绪**，但生产环境通常因「未入库注释资料」或「未配置 Embedding API」而不可用。按下列步骤即可启用。

## 1. 环境变量（API 服务）

在服务器 `/opt/bible/.env` 或 `services/api/.env` 中配置：

```bash
# 必填：向量嵌入（推荐阿里云 DashScope，与项目默认一致）
RAG_EMBEDDING_API_KEY=sk-xxxxxxxx
RAG_EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
RAG_EMBEDDING_MODEL=text-embedding-v3

# 可选：分块与混合检索权重
RAG_CHUNK_CHARS=900
RAG_CHUNK_OVERLAP=70
RAG_HYBRID_VECTOR_WEIGHT=0.55
RAG_HYBRID_KEYWORD_WEIGHT=0.45
```

检查状态：

```bash
curl https://2sc.prestoai.cn/ai/rag/status
# 期望：{"ok":true,"chunks":>0,...}
```

## 2. 准备注释资料

将 Markdown 或纯文本注释放入仓库（建议路径）：

```
content/commentary/
  matthew-henry/     # 示例：马太亨利注释（需自行准备合法授权文本）
  study-bible/       # 研经手册、查经资料
  cnv-notes/         # 和合本附注（如有）
```

**格式建议：**

- 使用 `## 马太福音 3 章` 或 `## JHN.3` 作为章节标题，便于按章分块
- 每段 300–900 字，避免整卷一个文件
- 文件编码 UTF-8

## 3. 入库（索引）

### 发版自动（推荐）

`release.sh` 在 API 就绪后会自动执行 `scripts/ensure_rag.sh`：

1. 从 HelloAO 拉取公版注释**全卷**（已齐全 / 上游耗尽则跳过）
2. 索引 `study-bible` + `public-domain`（body hash 未变跳过；`--reuse` 复用已有向量）

无 `RAG_EMBEDDING_API_KEY` 时用 hash 向量兜底，仍会入库。失败不阻断发版。

手动等价：

```bash
# 本地 / 容器内
bash scripts/ensure_rag.sh
# 或
make ensure-rag
```

### 手工索引

在项目根目录执行（需 Postgres 已启动且 API 能连库）：

```bash
# 公版注释全卷（Matthew Henry，约 21 卷）
python scripts/import_commentary_pd.py --skip-existing

# 入库
python scripts/rag_index.py --dir content/commentary/public-domain \
  --source-type commentary --reuse

# 验证检索
python scripts/rag_index.py --query "约翰福音3章 重生" --top-k 5
```

Docker 生产环境示例：

```bash
cd /opt/bible
docker compose -f docker-compose.prod.yml exec -T api bash /app/scripts/ensure_rag.sh
```

> `content/commentary/**` 默认不入 git，线上由 `ensure_rag.sh` 拉取并索引。

## 4. 数据库表

首次部署 Postgres 会自动执行 `infra/postgres/init/001_bible_rag.sql`，创建：

- `bible_documents` — 文档元数据
- `bible_rag_chunks` — 分块 + embedding（JSONB）

已有库可手动执行该 SQL。

## 5. 验证端到端

```bash
# 资源指南（不耗 AI 额度）
curl "https://2sc.prestoai.cn/guide/passage?ref=JHN.3.16"

# 小爱问答（需 RAG 块 + LLM）
curl -N -X POST https://2sc.prestoai.cn/ai/chat \
  -H "Content-Type: application/json" \
  -H "X-Guest-Id: 1234567890" \
  -d '{"ref":"JHN.3.16","question":"这节经文背景是什么？","mode":"explain"}'
```

回答中应出现 `[1][2]` 式脚注与 `citations` 元数据。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| `chunks: 0` | 未跑索引 | 执行 `rag_index.py` |
| 检索无结果 | 标题/ref 未匹配 | 文件加 `## 书卷章` 标题 |
| Embedding 失败 | API Key 无效 | 检查 `RAG_EMBEDDING_API_KEY` |
| 回答无脚注 | 库空或问题太偏 | 增加同主题资料后重建索引 |

## 7. 推荐资料来源（需自行确认版权）

- 公版释经书（如部分古典注释的中译本）
- 教会内部查经讲义（自有版权）
- 自行编写的章节摘要（`bible_summary` 已有基础，可扩展为 RAG 文档）

**不要**将未授权的商业注释 PDF 直接上线。

## 8. 后续增强（可选）

详见 `docs/RAG.md` Phase 2/3：pgvector HNSW、`scripture_refs` JSON 过滤、多查询拆分、用户私有资料库等。
