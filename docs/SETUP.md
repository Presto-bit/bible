# 开发环境搭建

> 本文档可复现地搭起：**后端 API（FastAPI）**、**Postgres（Docker）**、**经文数据流水线**、**移动端（Flutter）**。
> 已实测：Python 3.11+ / Docker / macOS（Apple Silicon）。

---

## 0. 一览

| 组件 | 状态 | 启动方式 |
|------|------|---------|
| 后端 API | ✅ 可跑（`/health` 200） | `uvicorn`（见 §2） |
| Postgres | ✅ Compose 就绪 | `docker compose up -d`（见 §3，需 Docker Desktop 运行中） |
| 经文数据 | ✅ CNV/KJV 已转换入库 | `epub_to_verses.py` + `import_bible.py`（见 §4） |
| 移动端 Flutter | ✅ 已脚手架 + 核心打通（analyze 0 问题 / build web ✓ / 在线冒烟通过） | 见 §5 |

> **一键命令（Makefile）**：`make setup`（建 venv+装依赖）、`make dev`（起库+建表+API）、`make test`、`make import-bible`、`make rag-index`、`make offline-pack`。`make help` 看全部。

---

## 1. 前置依赖

```bash
python3 --version      # 3.11+
docker --version       # 含 docker compose v2
# Flutter 见 §5
```

---

## 2. 后端 API（FastAPI）

```bash
cd /Users/mark/Desktop/PRO/Bible/services/api

# 创建虚拟环境并安装依赖
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 密钥：services/api/.env 已存在（gitignore），包含 DeepSeek / DashScope Key 与 DATABASE_URL
# 如缺失，从根目录 .env.example 复制并填写

# 启动（开发热重载）
uvicorn app.main:app --reload --port 8000
```

验证：

```bash
curl http://127.0.0.1:8000/health        # {"status":"ok","version":"0.1.0"}
curl http://127.0.0.1:8000/health/db      # 需 Postgres 起来后 database=true
open http://127.0.0.1:8000/docs           # Swagger UI
```

> `/health` 不依赖数据库（进程存活即 200）；`/health/db` 探测 Postgres 连通性，会快速失败（≤3s）不阻塞。

---

## 3. PostgreSQL（Docker Compose）

```bash
# 确保 Docker Desktop 已启动（daemon 运行中）
cd /Users/mark/Desktop/PRO/Bible/infra
docker compose up -d

# 首次启动会自动执行 postgres/init/*.sql（含 001_bible_rag.sql）
docker compose logs -f postgres      # 看到 "database system is ready"
```

> 宿主端口映射为 **5433→5432**（避让本机其他占用 5432 的 Postgres，如 `minimax_aipodcast-postgres`）。

连接串（已写入 `services/api/.env`）：

```
DATABASE_URL=postgresql://bible:bible@localhost:5433/bible
```

手动连库检查：

```bash
docker exec -it bible-postgres psql -U bible -d bible -c "\dt"
# 应看到 bible_documents / bible_rag_chunks / guest_devices / users / ai_usage_daily
```

停止 / 重置：

```bash
docker compose down            # 停止
docker compose down -v         # 连数据卷一起删（重新初始化建表）
```

---

## 4. 经文数据流水线

源 EPUB 已就位：`data/bible/cnv/圣经新译本.epub`、`data/bible/kjv/The Holy Bible (KJV).epub`。

```bash
cd /Users/mark/Desktop/PRO/Bible

# 4.1 EPUB → verses.json
python3 scripts/epub_to_verses.py \
  --epub data/bible/cnv/圣经新译本.epub \
  --translation cnv --format cnv --out data/bible/cnv/verses.json
# ✓ cnv: 31077 节 / 1189 章 / 66 卷

python3 scripts/epub_to_verses.py \
  --epub "data/bible/kjv/The Holy Bible (KJV).epub" \
  --translation kjv --format kjv --out data/bible/kjv/verses.json
# ✓ kjv: 31101 节 / 66 卷（best-effort，章界由节号归 1 推断）

# 4.2 verses.json → 离线 SQLite（books + verses + FTS5）
python3 scripts/import_bible.py --input data/bible/cnv/verses.json --out build/bible_cnv.sqlite
python3 scripts/import_bible.py --input data/bible/kjv/verses.json --out build/bible_kjv.sqlite
# 验证打印 getChapter(JHN,3) 首节 + FTS 命中数
```

产物 `build/bible_*.sqlite`（约 12–13 MB）已被 `.gitignore` 忽略，供 Flutter `assets/` 打包或离线下载分发。

打离线分发包（经库 + 静态内容 → zip + manifest，含 sha256）：

```bash
python3 scripts/build_offline_pack.py            # → build/offline_pack/bible_offline_<ver>.zip
# 实测：29 文件 / 原始 12.4MB / 压缩 5.3MB
```

> **CNV 为主译本**（`translation_id=cnv`），解析精确。
> **KJV 为对照译本**（Phase 2），源 EPUB 为 InDesign 导出、结构杂乱，章界用「节号归 1」启发式推断，存在极少量重复键（导入时自动去重）。生产可替换为 scrollmapper 开源 KJV JSON。

---

## 4b. 注释 RAG 入库与检索

需先启动 Postgres（§3）与 `.env` 的 `RAG_EMBEDDING_API_KEY`（DashScope；缺省则用 hash 兜底向量，质量较低）。

```bash
cd /Users/mark/Desktop/PRO/Bible
source services/api/.venv/bin/activate

# 4b.1 背景注释 EPUB → 按章节 .md（已产出 55 篇到 content/commentary/extracted/）
python scripts/commentary_to_md.py \
  --epub "content/commentary/新约圣经背景注释·旧约圣经背景注释...epub" \
  --out content/commentary/extracted

# 4b.2 切块 + DashScope embedding(dim 1024/batch 10) → bible_rag_chunks
python scripts/rag_index.py --dir content/commentary/extracted --source-type commentary
# 幂等：正文/向量签名未变则跳过；--force 强制重索引

# 4b.3 检索自测（向量 0.55 + 关键词 0.45 混合排序）
python scripts/rag_index.py --query "诗篇里阴间和来生是什么意思" --top-k 4
```

RAG 模块位于 `services/api/app/rag/`（`core` 切块/打分、`embedding` provider、`index` 入库、`retrieve` 检索）。单测：

```bash
cd services/api && python -m pytest tests/ -q   # test_rag_core.py + test_refs.py（24 项）
```

---

## 4c. 读经 / 资源指南 API（Sprint 2）

启动 API 后（`uvicorn app.main:app --port 8000`，需 Postgres + 经文 SQLite）：

```bash
# 66 卷目录
curl -s localhost:8000/bible/books

# 取一章经文（卷 id 或中文名均可）
curl -s --get localhost:8000/bible/chapter --data-urlencode "book=约翰福音" --data-urlencode "chapter=3"

# 经文引用解析取经文（JHN.3.16 / 约翰福音3:16-18 / 诗篇23）
curl -s --get localhost:8000/bible/ref --data-urlencode "ref=约翰福音3:16-18"

# 资源指南：按经文引用召回背景注释卡片（scripture_ref 过滤到该卷）
curl -s --get localhost:8000/guide/passage --data-urlencode "ref=JHN.3.16" --data-urlencode "top_k=3"
```

`/guide/passage` 流程：解析 ref → 取该处经文文本 → RAG 检索（`source_type=commentary` + 卷名过滤）→ 混合排序引用卡片。

---

## 4d. 小爱 AI 释经（Sprint 3 · SSE）

`POST /ai/chat`（DeepSeek 流式）。模式 `mode`：`understand` 理解默想 / `explain` 释经解释 / `apply` 生活应用。
游客带 `X-Guest-Id`（设备指纹）头，每日 10 次（`AI_GUEST_DAILY_LIMIT`），超额返回 429。

```bash
# 选经节、释经模式（SSE：event: meta → 多条 delta → done）
curl -sN -X POST localhost:8000/ai/chat \
  -H "Content-Type: application/json" -H "X-Guest-Id: my-device" \
  -d '{"ref":"JHN.3.16","mode":"explain"}'

# 带自定义问题
curl -sN -X POST localhost:8000/ai/chat \
  -H "Content-Type: application/json" -H "X-Guest-Id: my-device" \
  -d '{"ref":"诗篇23","question":"牧人的比喻在当时意味着什么？","mode":"explain"}'
```

SSE 事件：`meta`（mode/ref/display/citations 脚注/quota）→ 若干 `delta`（`{"text":...}`）→ `done`；
异常发 `error` 事件。注释库/额度库不可用时**降级**：无脚注作答、不阻断（fail-open）。

---

## 4e. 云同步 + 认证（Sprint 5）

> `002_user_sync.sql` 仅在**新卷**首启自动执行。现有卷需手动应用一次：

```bash
cd infra
docker compose exec -T postgres psql -U bible -d bible -f /docker-entrypoint-initdb.d/002_user_sync.sql
# 或从宿主：
docker compose exec -T postgres psql -U bible -d bible < postgres/init/002_user_sync.sql
```

认证：移动端 `Authorization: Bearer <opaque>`、Web `/2sc` 用 `fym_session` Cookie，后端转发 orchestrator `/api/v1/auth/me` 校验（配 `ORCHESTRATOR_BASE_URL`）。**未配 orchestrator 时**开发期可用 `X-User-Id` 头直连（`AUTH_DEV_ALLOW_USER_HEADER=true`）。

```bash
UID=11111111-1111-1111-1111-111111111111
# 推送增量（实体信封）
curl -s -X POST localhost:8000/sync/push -H "X-User-Id: $UID" -H "X-Device-Id: devA" \
  -H "Content-Type: application/json" -d '{"changes":[
    {"entity":"note","op":"update","id":"00000000-0000-0000-0000-0000000000aa",
     "data":{"ref":"JHN.3.16","body":"重生的默想","tags":["默想"]},"version":1,"client_ts":"2026-06-29T12:00:00Z"},
    {"entity":"reading_progress","op":"update","data":{"book":"JHN","chapter":3,"verse":16},"client_ts":"2026-06-29T12:01:00Z"}
  ]}'

# 拉取增量（按 server_seq 游标）
curl -s "localhost:8000/sync/pull?since=0" -H "X-User-Id: $UID"
# → {"changes":[...], "cursor":N, "has_more":false}

# 登录后归并游客 AI 用量
curl -s -X POST localhost:8000/auth/merge-guest -H "X-User-Id: $UID" -H "X-Guest-Id: my-device"
```

实体信封：`{entity, op:create|update|delete, id|keys, data, version, client_ts}`；冲突行级 **LWW（client_ts 较新者胜，同刻 version 高者胜）**，versioned 实体删除为 tombstone、其余物理删。同步实体见 `GET /sync/entities`。

---

## 4f. 静态内容接口（Sprint 4 · 无需 PG）

读 `data/` 已生成数据，经文正文由 CNV 经库实时解析填充。

```bash
B=localhost:8000
curl -s $B/content/plans                              # 读经×3 + 祷告计划
curl -s $B/content/plans/gospels_30/day/1             # 某计划某天
curl -s $B/content/plans/prayer_acts_30/day/1         # 祷告日（scripture.text 已填充）
curl -s "$B/content/daily-verse?day=1"                # 每日经文（缺 day 取当天）
curl -s $B/content/themes                             # 主题列表
curl -s --get $B/content/crossrefs --data-urlencode "ref=JHN.3.16"   # 交叉引用（related 带正文）
curl -s "$B/content/dictionary?term=耶稣"             # 词典
curl -s $B/content/illustrations                      # 插画索引
curl -s $B/content/illustrations/theme_盼望.svg       # 单张 SVG（含目录穿越防护）
```

---

## 5. 移动端（Flutter · macOS）

> 工程已就位于 `apps/mobile`（Flutter 3.44.4 / Dart 3.12.2）。下面是**复现安装**与**日常运行**两部分。

### 安装 SDK（国内走镜像，避免 googleapis 限速）

`brew install --cask flutter` 会从 `storage.googleapis.com` 拉取，国内极慢。改用官方镜像直装：

```bash
# 1) 下载 SDK（镜像，约 1.2GB / 数分钟）
curl -L -o /tmp/flutter_sdk.zip \
  https://storage.flutter-io.cn/flutter_infra_release/releases/stable/macos/flutter_macos_arm64_3.44.4-stable.zip
mkdir -p ~/development && cd ~/development && unzip -q /tmp/flutter_sdk.zip

# 2) 写入 ~/.zshrc（PATH + pub/构件镜像）
cat >> ~/.zshrc <<'EOF'
export PATH="$HOME/development/flutter/bin:$PATH"
export PUB_HOSTED_URL=https://pub.flutter-io.cn
export FLUTTER_STORAGE_BASE_URL=https://storage.flutter-io.cn
EOF
exec zsh

flutter --version && flutter doctor
```

> Android 打包需另装 Android Studio 的 cmdline-tools；iOS 模拟器 / Web(Chrome) 开箱即用。

### 运行（指向本地后端）

```bash
cd /Users/mark/Desktop/PRO/Bible/apps/mobile
flutter pub get

# iOS 模拟器 / macOS：默认基址 http://127.0.0.1:8000
flutter run

# Android 模拟器：客户端已自动用 10.0.2.2 访问宿主回环
# Web/PWA（Chrome）：
flutter run -d chrome

# 真机或生产后端：用 --dart-define 覆盖基址
flutter run --dart-define=API_BASE_URL=https://prestoai.cn
```

### 校验

```bash
flutter analyze                       # 期望 No issues found
flutter test                          # 模型/解析单测
flutter test test/live_backend_test.dart   # 在线端到端冒烟（需后端在 :8000，否则自动跳过）
flutter test test/sync_live_test.dart      # 多端同步：A push → B pull → 删除 tombstone（需后端 + AUTH_DEV_ALLOW_USER_HEADER=true）
flutter build web --no-tree-shake-icons    # 期望 ✓ Built build/web

# drift 表结构改动后需重跑 codegen：
dart run build_runner build --delete-conflicting-outputs
```

> 本地优先：笔记等写操作先落本地 SQLite（drift）并入 outbox，联网点「云同步」即 push + pull；冲突按行级 LWW（version + client_ts）裁决，删除走 tombstone。Web 版若要启用本地库，需补 drift 的 `sqlite3.wasm` + worker 资源（当前 Web 主打在线读，本地库以 iOS/Android 为先）。

### 工程结构

```
apps/mobile/lib/
  main.dart                       # ProviderScope + 主题 + AppShell
  app/{app_shell,profile_screen}  # 4 Tab 骨架 + 我的页（连通探针）
  core/{config,theme,session,api_client}  # 多端基址 / 静穆温润令牌 / 游客指纹+令牌 / Dio 注入
  features/bible/                 # 目录·章节阅读器（点节锚定问小爱）
  features/assistant/             # 小爱 SSE 流式问答 + 脚注 + 限额
  features/home/                  # 每日经文 hero + 快捷入口
```

依赖建议见 [IMPLEMENTATION-PLAN.md 附录](./IMPLEMENTATION-PLAN.md#附录建议-flutter-依赖pubspec)。

---

## 6. 一键脚本（可选）

```bash
# 数据：两译本 EPUB → SQLite
python3 scripts/epub_to_verses.py --epub data/bible/cnv/圣经新译本.epub --translation cnv --format cnv --out data/bible/cnv/verses.json
python3 scripts/epub_to_verses.py --epub "data/bible/kjv/The Holy Bible (KJV).epub" --translation kjv --format kjv --out data/bible/kjv/verses.json
python3 scripts/import_bible.py --input data/bible/cnv/verses.json --out build/bible_cnv.sqlite
python3 scripts/import_bible.py --input data/bible/kjv/verses.json --out build/bible_kjv.sqlite

# 服务：Postgres + API
( cd infra && docker compose up -d )
( cd services/api && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000 )
```

详见 [data/README.md](../data/README.md) 与 [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md)。
