# 圣经 App 代码实施计划

> 版本：v2.0  
> 更新日期：2026-06-29  
> 依据：[PRODUCT.md](./PRODUCT.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [RAG.md](./RAG.md) · [READING-EXPERIENCE.md](./READING-EXPERIENCE.md)

> **v2.0 变化（2026-06-29）：** 纳入近期定稿——**云优先用户数据**（服务端真相源 + 本地缓存/outbox）、**Web/H5+PWA** 第二端、**AI 选型**（DeepSeek `deepseek-v4-flash` + DashScope `text-embedding-v4`，Key 已配）、**静态数据已生成**（计划/每日经文/祷告/交叉引用/词典/插画）、**部署域名** `www.prestoai.cn`（H5 `/2sc`）。RAG 与登录**复用 `minimax_aipodcast`**（见 §11）。里程碑改为 M0–M6 详排（见 §3）。

---

## 目录

1. [总览](#1-总览)
2. [当前仓库状态](#2-当前仓库状态)
3. [里程碑分期](#3-里程碑分期)
4. [分阶段任务清单](#4-分阶段任务清单)
5. [按模块实现顺序](#5-按模块实现顺序)
6. [关键接口列表](#6-关键接口列表)
7. [数据库 Schema](#7-数据库-schema)
8. [团队分工建议](#8-团队分工建议)
9. [风险与阻塞项](#9-风险与阻塞项)
10. [第一周执行清单（Day 1–7）](#10-第一周执行清单day-17)

---

## 1. 总览

### 1.1 目标

将产品文档落地为可发布的 **Flutter 双端 App + FastAPI 后端**，实现：

- 5 Tab：首页 · 圣经 · 助手 · 发现 · 我的
- 离线读经（主译本 + KJV 对照）
- 读经计划、进度、笔记、阅读报告（分期）
- RAG 资料库 + AI 五种模式 + 资源指南

### 1.2 技术栈

| 层级 | 技术 |
|------|------|
| 客户端 | Flutter 3.x、go_router、drift/sqflite、Riverpod 或 Bloc |
| 本地库 | SQLite + FTS5（经文、笔记、进度、计划） |
| 后端 | Python 3.11+、FastAPI、Uvicorn |
| 数据库 | PostgreSQL（RAG、限流、二期同步） |
| RAG | 移植 minimax_aipodcast `rag_core` + `bible_rag_chunks` |
| LLM | OpenAI 兼容 API（可换国内模型） |

### 1.3 MVP 范围（Phase 1 结束可内测）

| 包含 | 不包含 |
|------|--------|
| 5 Tab 骨架与核心导航 | Apple 登录（Phase 2） |
| 首页：计划 1–2 套、Onboarding S0–S3、每日经文、今日时长 | 对照/原文 AI 模式（Phase 2） |
| 圣经：目录/继续阅读根页、阅读器、设置、书签、复制分享 | 完整 66 卷进度动画 |
| 助手：理解/解释/应用 + RAG + 半屏/全屏 | 发现 Tab 丰富内容 |
| 我的：笔记/高亮/收藏列表、基础设置 | 推送提醒（Phase 2） |
| 游客模式、本地数据 | 社交、用户上传资料库 |

### 1.4 总工期估算

| 阶段 | 周期 | 累计 |
|------|------|------|
| Phase 0 环境与数据 | 1–2 周 | 2 周 |
| Phase 1 核心闭环 | 8–10 周 | 10–12 周 |
| Phase 2 体验补齐 | 4–6 周 | 14–18 周 |
| Phase 3 打磨与上架 | 3–4 周 | 17–22 周 |

*按 1 名全栈估算；2 人前后端分工可压缩 Phase 1 约 20–30%。*

---

## 2. 当前仓库状态

| 路径 | 状态 |
|------|------|
| `docs/PRODUCT.md` 等 | ✅ 产品/架构/RAG/阅读规范齐全（含云优先 §2.4、Web+PWA 架构 §7） |
| Canvas Demo | ✅ `bible-app-demo.canvas.tsx` 全流程交互（Web 组件起点） |
| `.env`（密钥/域名） | ✅ DeepSeek + DashScope Key 已配、域名 `prestoai.cn` 已定（`services/api/.env`，gitignore） |
| `data/plans/` `daily-verses/` `crossrefs/` `dictionary/` `illustrations/` | ✅ **已生成真实数据**（计划×3、每日经文 124、祷告 30 天、交叉引用 30、词典 30、插画 20） |
| `scripts/build_*.py` | ✅ 数据生成器（plans/daily_verses/illustrations） |
| `docs/SETUP.md` | ✅ **已补全**（后端/Postgres/数据流水线/Flutter 可复现） |
| `apps/mobile/` | ✅ **已脚手架 + 核心打通（2026-06-29）**：Flutter 3.44.4（镜像直装于 `~/development/flutter`，pub 走 flutter-io.cn 镜像）；`flutter create`（org `cn.prestoai` / `presto_bible`，平台 ios+android+web）。已实现：`core/`（config 多端基址 + Dio 客户端注入 Bearer/X-Guest-Id + Session 游客指纹/安全令牌 + theme 静穆温润令牌）；`features/bible`（目录/章节阅读器，点节锚定问小爱）；`features/assistant`（**SSE 流式**多模式问答 + 脚注引用 + 限额提示 + DeepSeek 式自动滚动）；`features/home`（每日经文 hero + 快捷入口）；`app/`（5→4 Tab Shell + 我的页连通探针）。`flutter analyze` **0 问题**、单测 2 passed、`flutter build web` **✓ Built**、**在线端到端冒烟 2 passed**（经文目录/章节 + 小爱 SSE meta 引用/限额，真连 127.0.0.1:8000）。**本地优先 + 云同步已落地（2026-06-29）**：`core/database`（drift/SQLite：notes 镜像表 + outbox 队列 + sync_meta 游标，codegen 通过）、`core/sync/SyncEngine`（outbox push + 游标 pull + 行级 LWW 合并/软删 tombstone，对齐后端 registry）、`features/notes`（本地优先笔记 CRUD + 一键云同步 UI，drift 实时流，离线可写）。**多端同步端到端 2 passed**：①笔记 A→push→B pull 可见→删除→B 收 tombstone；②高亮+计划进度 A→push→B pull 可见（真连后端）。**新增产品功能（2026-06-29 续）**：SyncEngine 已泛化为**多实体**（note/highlight/bookmark = versioned 软删；plan_progress/reading_progress = 非 versioned）；**计划 Tab**（读经计划日列表→跳阅读器并记进度、ACTS 祷告计划日视图含称颂/认罪/感恩/祈求+默想、标记完成写 plan_progress 同步、计划卡进度条）；**阅读器标注**（4 色高亮 + 书签，本地优先+同步+渲染高亮底色）；**阅读进度**（读章自动记录 reading_progress，首页/圣经「继续阅读」回到上次位置）。5 Tab（首页/圣经/小爱/计划/我的）。`analyze` 0 问题、`build web` ✓。**四大功能全部推进（2026-06-29 续二）**：①**登录**：`features/auth`（开发登录 → `/auth/dev-login` 稳定 user_id → 本地保存 + `merge-guest` 合并游客；Profile 登录/退出 + 同步门控，未登录走登录页）；②**背经 SRS**：drift `memorize_cards` 表 + SyncEngine `memorize`（versioned, srs_state JSON 往返已验证）+ SM-2 lite（忘记/模糊/记得三档）+ 阅读器「加入背经」+ 复习页（到期卡片、显示经文、评分排程）；③**发现页**（替换计划 Tab，计划移入首页快捷入口）：`features/social`（共读群横滑卡 + 建群/邀请码加入 + 好友添加/列表；群消息流仅打卡/任务、emoji 互动、群主发任务、打卡绑定任务/经文且须挂经文或任务）；④**drift Web(wasm)**：`web/sqlite3.wasm`（3.3.3）+ `drift_worker.js`（drift-2.34.0）已落地，`build web` ✓ 资源进入 `build/web`。本地端口因 8000 被占改 **8011**。验证：`analyze` **0 问题**、单测 2 passed、后端 pytest **46 passed**、在线端到端 + 多端同步 **全过**、memorize `/sync` 往返 OK、社交后端 e2e（建群/加入/任务 owner 校验/打卡挂经文 400 规则/emoji/好友）全过。**小爱多会话 + 读经回顾（2026-06-29 续三）**：⑤**小爱多会话/记忆**：drift `ai_sessions`（走 `ai_session` 同步，title+anchor_ref）+ `chat_messages`（仅本地，历史不上行）；会话列表（历史/新建/重命名/删除/切换）、首条问题自动命名、锚定经文新会话、重开续接最近会话、消息持久化；`ai_session` `/sync` 往返已验证。⑥**读经回顾**：drift `reading_logs`（走 `reading_log` 同步，minutes/chapters）+ 圣经 Tab 前台计时埋点（每分钟累计、章读 +1）+ 报告页（本月时长/天数/章节 3 磁贴 + 近 6 月柱状 + 累计，端上聚合）；`reading_log` `/sync` 往返已验证。复验：`analyze` **0**、单测 + 在线端到端 + 多端同步 **6 passed**、`build web` ✓。**全部剩余功能落地（2026-06-29 续四）**：⑦**D1 AI 个性化计划**：后端 `POST /content/generate-plan` + `/content/plan-scopes`（确定性按范围展开「卷·章」均分到天，全覆盖不重复，单测 6 项）；移动端生成页（范围 chips + 天数 slider + 主题 → 预览 → 保存到本地 `generated_plans` → 详情按天进阅读并记 `plan_progress`），计划 Tab 新增「AI 生成计划」入口 + 「我的生成计划」分区。⑧**D2 主动默想**：首页「今日默想」卡 → 打开小爱（锚定每日经文 + 默想引导 prompt + 应用模式）。⑨**阅读器**：纯手势翻页（左右滑动跨章）+ 长按选中（复用操作表）+「复制经文」。⑩**Onboarding S0–S3**：首启动引导（欢迎/昵称/目标 PageView），prefs 落 `onboarding_done`，首页问候用昵称。⑪**go_router 深链**：`MaterialApp.router` + 路由（`/` 门控 onboarding/shell、`/reader`·`/assistant`·`/plans`·`/discover`·`/memorize`·`/report`·`/group/:id`），不破坏 IndexedStack 底栏。⑫**社交内容审核钩子**：`moderation.py`（黑名单 + 外链/手机号/微信导流正则 + 长度），打卡/任务违规 400（单测 4 项）。⑬**提醒设置**：「我的」每日提醒开关 + 时间选择（prefs 持久化；APNs/FCM 投递待平台凭证，已标注）。复验全绿：后端 pytest **53 passed**、mobile `analyze` **0** + 单测 + 在线端到端/多端同步 **6 passed**、`build web` ✓、`apps/web` `next build` ✓。**未接入功能补齐（2026-06-29 续五）**：⑭**RAG 真正 grounding**：`ai/chat.py` 检索重写（无 ref 也检索；有卷先按卷过滤，命中 0 回退**关键词预过滤**全库检索 → CJK 二元组 + 英文词 ILIKE OR），`retrieve()` 增 `keywords` 参数；四场景 citations 全部生效（约翰福音精准、缺卷/自由提问主题相关）。⑮**RAG 覆盖修复 + 重建**：`commentary_to_md.py` 改**锚点感知拆分**（同一 html 内按各卷锚点切分），注释由 55 篇折叠 → **92 篇按卷独立**（创世记/出埃及记/罗马书/启示录…齐全，内容零损失 177.5 万字），`index.py`+`rag_index.py` 增**嵌入复用缓存**（`--reuse`）+ `--purge`，重建 15065 块**复用 15026、仅新嵌入 39**（省 99.7% DashScope 调用），按卷标题检索验证命中各自注释。⑯**阅读器接入交叉引用 + 词典**：`content_repository`（`/content/crossrefs`、`/content/dictionary`）+ 选经操作表「相关经文（串珠）」弹窗（点跳转）+「圣经词典」页（搜索 30 词条、点 refs 跳转），`readerJumpProvider` 实现跨组件跳章。⑰**正式登录**：后端 `GET /auth/whoami`（校验 Bearer/Cookie/dev 头返回 user_id）；移动端 `loginWithToken`（orchestrator opaque 令牌 → whoami 校验 → Bearer 持久化 + merge-guest），登录页加「正式账号登录（会话令牌）」（dev 路径保留；生产需 `ORCHESTRATOR_BASE_URL`）。⑱**推送投递（本地通知）**：`flutter_local_notifications` + `timezone`，`NotificationService` 每日定时提醒（`zonedSchedule` + `matchDateTimeComponents.time`），接入「我的 · 每日提醒」开关/时间；**Web/桌面 no-op 守卫**，`build web` 仍 ✓；远程 APNs/FCM 仍需平台凭证。⑲**Web 深化**：`apps/web` 加「问小爱」（fetch 流式解析 SSE over POST + 模式/锚定经文 + citations 展示）、「登录」（dev-login + localStorage）、`InstallBanner`（beforeinstallprompt 安装）；SW 预缓存扩至新路由。复验全绿：后端 pytest **53 passed**、mobile `analyze` **0** + 单测/在线端到端/多端同步 **6 passed**、`build web` ✓、`apps/web` `next build` ✓ **7 静态页**、RAG citations 端到端验证（约翰/创世记/罗马书/自由提问全有脚注） |
| `apps/web/` | ✅ **Next.js 15 + PWA 脚手架（2026-06-29）**：App Router + TS，`basePath/assetPrefix=/2sc`（对齐 `www.prestoai.cn/2sc`）；首页（每日经文）+ 圣经阅读页（目录→逐章，调后端 `/bible`、`/content`）；手写 PWA（`manifest.webmanifest` + `sw.js` App Shell 预缓存/SWR + `PwaRegister` 注册，scope `/2sc/`）；`lib/api.ts` 复用同一 FastAPI。**`npm run build` ✓ 5 静态页**（/ · /reader · /_not-found）。⏳ 待续：Web 接 AI/同步、OPFS+SQLite-WASM 离线经包、可安装横幅。**与 App 对齐：底部 5-Tab（2026-06-30）**：`BottomTabs`（首页/圣经/发现/小爱/我的）替换顶部条；**首页**（每日经文 + 快捷入口）、**圣经**（逐章 + 点节「相关经文(串珠,可跳转)/问小爱」）、**发现**（共读群列表/建群/邀请码加入/群详情含成员·任务·动态流·经文打卡·群主发任务·emoji 反应 + 好友添加/列表，走 `/social/*`，登录门控）、**小爱**（SSE over POST + 模式 + `?ref=` 预填 + citations）、**我的**（dev-login 登录态 + 计划/共读群/阅读/小爱入口）、**计划页**（精选计划 + AI 生成预览，走 `/content/*`）。`next build` ✓ **10 路由**（含 `discover/group/[id]` 动态）；本地 dev 指向 `127.0.0.1:8011`，6 Tab 全 200，社交 e2e（建群/任务/打卡/动态）全通。仍待：背经/读经回顾（依赖本地数据）、多端同步 JS 引擎、离线经包 |
| `services/api/` | ✅ **FastAPI 骨架可跑**：`requirements.txt` + `app/{config,db,main}.py`，`/health` 200、`/health/db` 探针、`/docs`；venv 已建 |
| `scripts/epub_to_verses.py` | ✅ **已实现**：CNV 精确（66 卷/1189 章/31077 节）、KJV best-effort（66 卷/31101 节） |
| `scripts/import_bible.py` | ✅ **已实现**：verses.json → `build/bible_*.sqlite`（books+verses+FTS5，含去重与验证） |
| `services/api/app/rag/*` | ✅ **Sprint 1 已落地**：`core.py`（切块/关键词/cosine/混合排序）、`embedding.py`（DashScope `text-embedding-v4`/dim1024/batch10，hash 兜底，**已联网验证**）、`index.py`、`retrieve.py`（支持 `title_contains` 卷过滤） |
| `services/api/app/bible/*` | ✅ **Sprint 2**：`reader.py`（只读 SQLite 取经文/卷名）、`refs.py`（scripture_ref 解析：`JHN.3.16`/`约翰福音3:16`/范围/全角）、`router.py`（`/bible/books`·`/chapter`·`/ref`） |
| `services/api/app/guide/*` | ✅ **Sprint 2**：`GET /guide/passage?ref=` → 取经文文本→按卷过滤注释→混合排序引用卡片（JHN.3.16 命中约翰福音 3:16 注释 @0.967，HTTP 已验证） |
| `services/api/app/ai/*` | ✅ **Sprint 3**：`POST /ai/chat` SSE（DeepSeek `deepseek-v4-flash` 流式，**已联网验证 token 流**）+ 三模式（理解/释经/应用）+ RAG 脚注注入 + **多轮 `history`**（local-first 客户端持有，已验证跟进保持上下文）+ 游客 `X-Guest-Id` 10 次/日（`guest_devices`+`ai_usage_daily`）；DB/注释库不可用时**降级 fail-open** |
| `services/api/app/sync/*` + `app/auth/*` | ✅ **Sprint 5 完成**：`/sync/push`·`/sync/pull?since=`（registry 驱动的通用增量同步，行级 LWW + tombstone）、`/auth/merge-guest`、`session.py`（orchestrator opaque session 校验，开发期 `X-User-Id` 兜底）；SQL `002_user_sync.sql`（§7.3 全表 + `user_data_seq`）已对真实 PG 应用。**PG 全链路已跑通（2026-06-29）**：push 3 实体→applied:3；pull since=0→3 变更（cursor=3）；**LWW 旧 client_ts 正确 skipped:1**；tombstone delete→pull 回 `op:delete`；merge-guest→`merged:true`（已修外键：合并前 `INSERT users ON CONFLICT DO NOTHING`）；AI 脚注 PG 在线时正常返回引用（约翰福音 4 条，score 0.97↓）；**额度边界精确**：第 1–10 次放行、第 11+ 次 429。**开发登录已加（2026-06-29）**：`POST /auth/dev-login`（handle→`uuid5` 稳定 user_id 落 `users`，契约同 orchestrator，仅开发期启用） |
| `services/api/app/social/*` + `infra/postgres/init/003_social.sql` | ✅ **社交后端（2026-06-29）**：`003` 扩展 `users(handle/display_name)` + 建 `social_group/group_member/group_message/group_task/friendship`（已对真实 PG 应用）。`/social/*`：建群/邀请码加入/我的群（角色+人数）/群详情（成员+任务）/消息流（打卡·任务+emoji 反应）/打卡（**须挂经文或任务，否则 400**）/发任务（**仅群主，否则 403**）/emoji 反应切换/好友添加（按 handle，对称两行）/好友列表。群**不支持自由聊天**、好友**不支持私聊**（符合 PRODUCT）。e2e 全过 |
| `services/api/app/content/*` | ✅ **Sprint 4 内容接口**（无需 PG，HTTP 全验证）：`/content/plans`(读经×3+祷告)、`/plans/{id}/day/{n}`、`/daily-verse`、`/themes`、`/crossrefs?ref=`、`/dictionary`、`/illustrations[/{file}.svg]`；经文正文由 CNV 经库实时解析填充（祷告/每日经文/交叉引用均已验证出真实经文） |
| `services/api/tests/` | ✅ **46 项单测通过**：rag_core(10) + refs(14) + ai(7) + sync(7) + content(8) |
| `scripts/build_offline_pack.py` | ✅ **已实现**：经库 + 静态内容 → `build/offline_pack/*.zip` + manifest(sha256)（实测 29 文件 12.4MB→5.3MB） |
| `Makefile` | ✅ **已建**：`setup/db-up/db-init/import-bible/commentary/rag-index/offline-pack/api/test/dev` 一键命令 |
| `scripts/rag_index.py` | ✅ **已实现**：`--file/--dir` 入库、`--query` 检索自测 |
| `scripts/commentary_to_md.py` | ✅ **已实现**：注释 EPUB → 按章节 .md |
| `data/bible/*` | ✅ **已转换**：`cnv/verses.json`、`kjv/verses.json`；`build/bible_{cnv,kjv}.sqlite`（gitignore） |
| `content/commentary/extracted/` | ✅ **已抽取并入库**：背景注释 EPUB → 55 篇 .md（~1.77M 字）→ `bible_rag_chunks` **15,031 块**（DashScope dim1024，0 失败，检索已验证） |
| `infra/postgres/init/001_bible_rag.sql` | ✅ RAG 基础表（已建库执行） |
| `infra/docker-compose.yml` | ✅ **已跑通**：Postgres 16，宿主端口 **5433**（避让 5432 占用），自动执行 init SQL |

---

## 3. 里程碑与详细排期（M0–M6）

> 双轨并行（后端 BE / 移动端 FE，含 Web/数据轨）约 **14 周**；单人全栈串行约 **19–20 周**。所有阻断项已清除（版权直接执行、Key/域名/上云决策已定）。

### 3.1 排期总览（甘特）

| 周 | 里程碑 | 后端 BE | 移动端 FE | Web/数据 |
|----|--------|---------|-----------|----------|
| W1 | **M0 地基** | FastAPI 骨架/health/PG | flutter create + 5 Tab 壳 | `epub_to_verses.py` |
| W2–3 | M0→M1 | 搬 `rag_core`+`EmbeddingProvider`，建 `bible_rag_chunks` | 本地库+经文导入+阅读器 V1 | 经文入库 SQLite+FTS、注释切块 |
| W4–5 | **M1 读经核心** | `/guide/passage` + `scripture_ref` 过滤 | 目录/续读/时长埋点/笔记 CRUD | `index_commentary` 注释入库 |
| W6–7 | **M2 AI 释经** | `/ai/chat` SSE + 三模式 + 游客额度 | 小爱半屏+Tab+多会话锚点 | Web 脚手架起步 |
| W8–9 | **M3 计划与个人** | 会话/记忆持久化 | 计划/祷告/背经 SRS + 我的经文库 + 报告 | Next.js 复用 canvas 组件 |
| W10–11 | **M4 云同步** | `/sync/push|pull` 增量 + merge-guest + 对接 orchestrator session | 本地 outbox + 同步状态 UI + 登录合并 | Web 接同步 |
| W12 | **M5 社交** | 群/打卡/任务/分享 API + 审核钩子 | 群结构化打卡流 + 好友分享 | Web 社交只读 |
| W13 | **M6 打磨** | 推送/内容审核 | 排版精修/性能/无障碍 | PWA 离线(SW+OPFS)+可安装 |
| W14 | M6 上架 | 部署 `www.prestoai.cn` | TestFlight/内测包 | `www.prestoai.cn/2sc` 上线 |

### 3.2 逐 Sprint 详排

**Sprint 0 · W1：地基（立即可启动）**

| Day | 任务 | 验收 |
|-----|------|------|
| D1 | `flutter create`；FastAPI `/health`；`docker compose` 起 PG（跑 `001_bible_rag.sql`） | 三者本地跑通 |
| D2 | `scripts/epub_to_verses.py`：自有 CNV/KJV EPUB → `verses.json` | ≥1 卷可解析 |
| D3 | `import_bible.py`：→ `bible_cnv.sqlite` + FTS5 | `getChapter(JHN,3)` 出经文 |
| D4 | Flutter：go_router + drift + riverpod + 5 Tab Scaffold | Tab 切换、再点回根 |
| D5 | 经文 SQLite 入 assets/模拟下载；阅读器读 1 章 | 无网读 JHN 3 |

**Sprint 1 · W2–3：RAG 移植 + 阅读核心**
- BE：拷 `rag_core.py`→`app/rag/core.py`、`EmbeddingProvider`→`app/rag/embedding.py`（DashScope `text-embedding-v4`/dim 1024/batch 10）；建 `bible_rag_chunks`（JSONB 向量）。单测 `split_text_into_chunks`（默认 1100/90）。
- FE：阅读器 V1（按节渲染、节号上标、`Aa` 设置、章切换、滚动恢复）；`reading_progress` 写入。
- 数据：`rag_index.py` = 读 `content/commentary/*` → 切块 → Embedding → 入 PG；先跑 1 本注释。
- 验收：检索「约翰福音 3:16」返回相关注释（混合检索 0.6/0.4）。

**Sprint 2 · W4–5：资源指南 + 目录/笔记**
- BE：`GET /guide/passage?ref=JHN.3.16`（retrieve + **新建 `scripture_ref` 过滤**，参考 minimax `chapter_filter`）。
- FE：66 卷目录+进度%；圣经 Tab 根路由（有进度续读/无进度目录）；时长 session 埋点；书签/高亮/笔记 CRUD（本地缓存）。
- 验收：底栏「指南」<500ms 出引用卡；笔记在「我的」列表。

**Sprint 3 · W6–7：小爱（AI 主路径）**
- BE：`POST /ai/chat` SSE（DeepSeek），mode=理解/解释/应用，注入 RAG 片段+脚标；游客 `X-Guest-Id` + **10 次/日**（`guest_devices`+`ai_usage_daily`，**新建**）。
- FE：圣经半屏 AI（零输入默认答→展开 Tab 接力）；小爱 Tab；**多会话锚点路由**（demo 已验证）。
- 验收：选经节 1 步出答案带脚标；额度用尽 429 友好提示。

**Sprint 4 · W8–9：计划/个人 + Web 起步**
- FE：读经计划引擎（`plans/*.csv`）、祷告（`prayer_acts_30.json`）、背经 SRS；我的经文库；阅读报告（端上聚合 `reading_log`）。
- Web：Next.js 脚手架（App Router），canvas 组件迁入 `apps/web`，经文页 SSG。
- 验收：今日计划/祷告一键进读；SRS 排程；报告图表。

**Sprint 5 · W10–11：云同步（落地"用户数据上服务器"）**
- BE：`/sync/push`、`/sync/pull?since=cursor`（实体信封）；**云优先用户表**（见 §7.3）；`merge-guest`（**新建**）；对接 orchestrator **opaque session**（`/api/v1/auth/me` 校验）。
- FE：本地缓存 + **outbox** 重试 + 乐观更新；同步状态 UI（已同步/同步中/待同步）；登录合并。
- 验收：A 设备记笔记、B 设备 10s 内拉到；离线改→复网回放。

**Sprint 6 · W12：社交**
- BE：群（受邀/创建、成员、任务发布）、**打卡必挂经文/任务**、emoji 反应、好友分享（仅点赞）+ 文本审核钩子。
- FE：群结构化打卡流（足迹候选一键带入）、好友分享卡。
- 验收：打卡强制挂经文；无 IM。

**Sprint 7 · W13–14：Web/PWA + 上架**
- Web：PWA（Workbox SW、App Shell 预缓存、OPFS+SQLite-WASM 离线经包、IndexedDB outbox、`manifest` 可安装）；部署 `www.prestoai.cn/2sc`。
- FE/BE：排版精修、长章 60fps、隐私政策/AI 免责、iOS/Android 打包、API 部署 `www.prestoai.cn`。
- 验收：Web 可安装可离线读；TestFlight/内测包出包。

---

## 4. 分阶段任务清单

### Phase 0

| 任务名 | 模块路径 | 依赖 | 验收标准 | 优先级 |
|--------|----------|------|----------|--------|
| 编写开发环境文档 | `docs/SETUP.md` | 无 | Flutter/Python/PG 安装步骤可复现 | P0 |
| 初始化 Flutter 工程 | `apps/mobile/` | Flutter SDK | `flutter run` 出 Hello World | P0 |
| 初始化 FastAPI 工程 | `services/api/` | Python 3.11 | `uvicorn` 返回 `/health` | P0 |
| Docker Compose Postgres | `infra/docker-compose.yml` | Docker | `001_bible_rag.sql` 自动执行 | P0 |
| 经文 JSON 规范与样例 | `data/bible/` | 版权数据 | 至少 1 卷完整经节可解析 | P0 |
| EPUB 转 verses 脚本（可选） | `scripts/epub_to_verses.py` | ebooklib | EPUB → `verses.json` | P1 |
| 导入离线 SQLite | `scripts/import_bible.py` | verses.json | 生成 `bible_*.sqlite` + FTS5 | P0 |
| 打离线包脚本 | `scripts/build_offline_pack.py` | import_bible | ✅ 经库+内容→zip+manifest（已验证） | P0 |
| 计划/词典/交叉引用数据 | `data/plans/` 等 | 开源或自建 | 2 套计划 + 交叉引用可查询 | P1 |
| 根目录 Makefile 或 justfile | `/` | 上述脚本 | ✅ `make dev`=起库+建表+API；`make setup/test/...` | P2 |

### Phase 1

| 任务名 | 模块路径 | 依赖 | 验收标准 | 优先级 |
|--------|----------|------|----------|--------|
| App Shell + 5 Tab | `apps/mobile/lib/app/` | Flutter 工程 | 底部导航切换，再点回根页 | P0 |
| 路由 go_router | `apps/mobile/lib/app/router.dart` | Shell | 深链与 Tab 重置符合 PRODUCT §15 | P0 |
| 本地 DB 层 | `apps/mobile/lib/core/database/` | drift | 经文/笔记/进度表迁移可跑 | P0 |
| 首次启动下载/导入经文 | `apps/mobile/lib/core/database/bible_loader.dart` | 离线包 | 无网可读至少一章 | P0 |
| 游客 ID | `apps/mobile/lib/core/storage/guest_id.dart` | 无 | 持久化 device_id | P0 |
| 首页 UI + Onboarding | `features/home/` | DB、计划数据、`onboarding_state` | S0–S3 分态 UI、计划卡片、今日时长 | P0 |
| 圣经 Tab 根路由 | `features/bible/` | `reading_progress` | 有进度→继续阅读；无进度→目录 | P0 |
| 读经计划引擎 | `features/home/plans/` | plans CSV | 今日任务一键进阅读页 | P0 |
| 圣经目录 | `features/bible/catalog/` | 本地经文 | 66 卷列表+进度% | P0 |
| 阅读器 V1 | `features/bible/reader/` | READING-EXPERIENCE | 章切换、字号主题、节号上标 | P0 |
| 阅读时长埋点 | `features/bible/reader/session_tracker.dart` | 无 | 前台累计秒数写入 DB | P0 |
| 书签/高亮/笔记 CRUD | `features/bible/notes/` | DB | 锚定经节，我的页可列表 | P0 |
| 长按菜单 | `features/bible/reader/` | 阅读器 | **选中弹出条**；**纯手势翻页**，章末自动下一章 | P0 |
| Auth 模块 | `apps/mobile/lib/core/auth/` | orchestrator | login/register/me/logout；Secure Storage | P0 |
| Auth UI | `features/profile/auth/` | Auth 模块 | **头像菜单** → 紧凑登录/注册 Sheet | P0 |
| Session 拦截器 | `core/network/auth_interceptor.dart` | token | Bearer + 401 清会话 | P0 |
| merge-guest API | `services/api/app/auth/` | PG + 本地 | 登录后合并游客数据 | P1 |
| API 客户端 | `apps/mobile/lib/core/network/` | FastAPI | Dio + SSE 流式 | P0 |
| 移植 rag_core | `services/api/app/rag/core.py` | minimax 源码 | 分块+混合检索单测通过 | P0 |
| RAG 索引 CLI | `scripts/rag_index.py` | rag + PG | 1 本 MD 注释入库可查 | P0 |
| 资源指南 API | `services/api/app/guide/` | RAG retrieve | ✅ `GET /guide/passage` 返回引用卡片（scripture_ref 过滤，HTTP 验证） | P0 |
| AI 编排 V1 | `services/api/app/ai/` | RAG + LLM | ✅ 理解/解释/应用 SSE 流式 + 脚注 meta（DeepSeek 验证） | P0 |
| 圣经半屏 AI Sheet | `features/bible/ai_sheet/` | API | 默认经节、展开到助手 Tab | P0 |
| 助手 Tab | `features/assistant/` | API | 选经节、三模式、存笔记 | P0 |
| 我的 Tab 基础 | `features/profile/` | DB、Auth | 笔记列表、设置、**登录/注册入口** | P0 |
| 发现 Tab 占位 | `features/discover/` | 无 | 静态列表或 Empty 态 | P2 |
| AI 日限额 | `services/api/app/ai/usage.py` + guest_devices | PG | ✅ 游客 10 次/日，超额 429；额度库不可用 fail-open | P1 |

### Phase 2

| 任务名 | 模块路径 | 依赖 | 验收标准 | 优先级 |
|--------|----------|------|----------|--------|
| KJV 对照 UI | `features/bible/compare/` | kjv sqlite | 逐节中英对照 | P0 |
| 交叉引用 | `features/bible/cross_refs/` | crossrefs 数据 | 侧栏列表+跳转 | P0 |
| 阅读页资源指南 | `features/bible/resource_guide/` | guide API | <500ms 展示摘录 | P0 |
| AI 对照/原文模式 | `services/api/app/ai/prompts/` | KJV 数据 | 结构化对照表输出 | P1 |
| 助手对话历史 | `features/assistant/` + 本地/API | Phase1 AI | 可续聊、列表 | P0 |
| FTS 搜索增强 | `features/bible/search/` | FTS5 | 词组/书卷范围 | P0 |
| 阅读报告 Dashboard | `features/profile/report/` | 会话数据 | 周/月时长、卷进度、建议 | P0 |
| 本地通知提醒 | `features/profile/reminders/` | flutter_local_notifications | 计划深链；继续阅读→圣经 Tab | P1 |
| 发现专题页 | `features/discover/topic/` | 静态 JSON | 主题经文集+跳转 | P1 |
| 专名词典浮层 | `features/bible/entities/` | dictionary | 点击<100ms 浮层 | P1 |
| 首页智能推荐 | `features/profile/suggestions/` | 报告规则引擎 | 「下次读什么」仅在「我的」 | P1 |

### Phase 3

| 任务名 | 模块路径 | 依赖 | 验收标准 | 优先级 |
|--------|----------|------|----------|--------|
| 对话/引文/诗歌排版 | `reader/text_span_builder.dart` | 标注数据 | 符合 READING-EXPERIENCE §7–10 | P1 |
| 阅读页底栏收起 | `reader/chrome.dart` | 阅读器 | 3s 无操作自动收 | P2 |
| AI 有帮助/不准确反馈 | `services/api/app/ai/feedback` | AI | 写入表供调优 | P2 |
| 完成卷徽章动画 | `features/profile/report/` | 进度 | 首次完成轻庆祝 | P2 |
| 性能：长章 60fps | `reader/` | 性能测试 | 诗篇 119 滚动流畅 | P0 |
| iOS/Android 打包 | `apps/mobile/` | 证书 | TestFlight / 内测 APK | P0 |
| 隐私政策与 AI 免责声明 | `docs/legal/` | 无 | 首次 AI 弹窗+设置可查 | P0 |

---

## 5. 按模块实现顺序

### 5.1 推荐全局顺序（依赖图）

```
Phase 0: 环境 → 经文数据 → 离线包
    ↓
Flutter: Shell/路由 → 本地DB → 经文加载 → 目录 → 阅读器
    ↓
并行轨 A: 首页+计划+进度
并行轨 B: API骨架 → RAG移植 → 索引注释 → guide/ai
    ↓
阅读器 + AI半屏 + 助手Tab + 笔记
    ↓
我的页 + 发现占位 → Phase1 内测
    ↓
Phase2: 对照/引用/指南/报告/搜索/发现
```

### 5.2 Flutter 模块顺序

| 顺序 | 模块 | 关键文件/目录 |
|------|------|----------------|
| 1 | App Shell | `lib/app/app.dart`, `main.dart`, `theme/app_theme.dart` |
| 2 | 路由 | `lib/app/router.dart`, `scaffold/main_scaffold.dart` |
| 3 | 核心 | `core/database/`, `core/storage/`, `core/network/api_client.dart` |
| 4 | 圣经数据 | `core/database/tables/verses.dart`, `bible_repository.dart` |
| 5 | 圣经 Tab | `features/bible/`（根路由：有进度继续读/无进度目录）、`catalog/`, `reader/` |
| 6 | 阅读主题 | `core/theme/reading_theme.dart`（见 READING-EXPERIENCE） |
| 7 | 首页 | `features/home/`（Onboarding、计划、统计摘要） |
| 8 | 笔记域 | `features/bible/notes/` + `features/profile/notes_list/` |
| 9 | AI 半屏 | `features/bible/widgets/ai_bottom_sheet.dart` |
| 10 | 助手 Tab | `features/assistant/chat_page.dart`, `mode_tabs.dart` |
| 11 | 我的 | `features/profile/profile_page.dart`, `settings/` |
| 12 | 发现 | `features/discover/`（Phase 2 充实） |

**阅读器 V1 最小实现：**

- `CustomScrollView` + `Text.rich` 按节渲染
- 节号 `WidgetSpan` 上标
- 顶栏：章标题、`Aa` 设置 Sheet、书签
- 底栏：默认仅 `AI` + `更多`（PRODUCT 建议）
- 不做专名/对话标注直到 Phase 2 数据就绪

### 5.3 Backend 模块顺序

| 顺序 | 模块 | 关键文件 |
|------|------|----------|
| 1 | 项目骨架 | `app/main.py`, `requirements.txt`, `config.py` |
| 2 | DB 连接 | `app/db.py`, 执行 `001_bible_rag.sql` |
| 3 | RAG 核心 | `app/rag/core.py`（从 minimax 复制并去依赖） |
| 4 | Embedding | `app/rag/embedding.py`（简化版 Provider） |
| 5 | 索引 | `app/rag/index.py`, `scripts/rag_index.py` |
| 6 | 检索 | `app/rag/retrieve.py`（经节 filter + hybrid） |
| 7 | 资源指南 | `app/guide/router.py` |
| 8 | AI | `app/ai/router.py`, `prompts/`, `blocks_schema.py` |
| 9 | 限流 | `app/middleware/guest_limit.py` |
| 10 | Phase 1 | `app/auth/`（merge-guest、session 校验）, `app/sync/`（Phase 2） |

### 5.4 数据流水线顺序

| 顺序 | 脚本 | 输出 |
|------|------|------|
| 1 | `epub_to_verses.py`（可选） | `data/bible/cnv/verses.json` |
| 2 | 开源 KJV JSON 转换 | `data/bible/kjv/verses.json` |
| 3 | `import_bible.py` | `build/bible_cnv.sqlite`, `bible_kjv.sqlite` |
| 4 | `build_offline_pack.py` | `dist/bible_pack_v1.zip` + manifest.json |
| 5 | `rag_index.py` | PG `bible_rag_chunks` |
| 6 | 导入 crossrefs/dictionary | 打入 app sqlite 或 assets |

---

## 6. 关键接口列表

### 6.1 REST API（Phase 1 必做）

| 方法 | 路径 | 说明 | Flutter 调用方 |
|------|------|------|----------------|
| GET | `/health` | 健康检查 | 启动时 |
| GET | `/bible/manifest` | 离线包版本与 URL | 首次启动/更新 |
| GET | `/guide/passage?ref=JHN.3.16` | 资源指南片段 | 圣经底栏「指南」 |
| POST | `/ai/chat` | AI 对话（SSE 流式） | 半屏 AI、助手 Tab |
| POST | `/ai/chat` body | `{ ref, mode, question, surface, chunk_ids? }` | 见 PRODUCT §6.8 |
| GET | `/guest/register` | 注册游客（可选） | 首次启动 |
| — | `X-Guest-Id` header | 游客标识 | 未登录 AI 请求 |
| — | `Authorization: Bearer` | minimax session token | 已登录所有 API |

**认证（代理或直连 minimax orchestrator `/api/v1/auth`）：**

| 方法 | 路径 | Flutter 调用方 |
|------|------|----------------|
| GET | `/auth/config` | 启动：是否必须登录 |
| POST | `/auth/login` | 登录页 |
| GET | `/auth/me` | 会话恢复 |
| POST | `/auth/logout` | 退出 |
| POST | `/auth/register/*` | 注册三步 |
| POST | `/auth/merge-guest` | 登录成功后合并本机数据 |

### 6.2 Phase 2 接口

| 方法 | 路径 | Flutter 调用方 |
|------|------|----------------|
| GET | `/bible/cross-refs?ref=` | 圣经「引用」侧栏 |
| GET | `/reports/suggestions` | 首页/我的报告（或纯本地规则） |
| POST | `/ai/feedback` | AI 回答反馈 |
| GET | `/discover/topics` | 发现 Tab |
| GET | `/discover/resources/:id` | 资源详情 |

### 6.3 云同步（M4 · 云优先核心）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/sync/pull?since={cursor}&entities=` | 拉取增量（按 `server_seq` 游标）→ `{changes[], cursor, has_more}` |
| POST | `/sync/push` | 推送增量 `{changes:[{entity,op,id,data,version,client_ts}]}` |
| GET | `/me/export` | 全量导出（合规） |
| DELETE | `/me/data` | 账号数据删除（合规） |
| WS | `/sync/stream` | 多端变更通知（推送拉取信号） |

实体信封统一：`{ entity, id, op:create|update|delete, data, version, updated_at, device_id }`；冲突字段级 **LWW + version**，列表型用 **id + tombstone**。

**认证（复用 minimax orchestrator，见 §11）：** 移动端 `Authorization: Bearer {opaque_token}`；Web `/2sc` 用 BFF **HttpOnly Cookie**；后端校验调 `/api/v1/auth/me`。游客 `X-Guest-Id`，登录后 `POST /auth/merge-guest`。

### 6.4 AI 请求/响应契约（摘要）

**请求：**

```json
{
  "ref": "JHN 3:16",
  "scope": "verse",
  "mode": "understand",
  "surface": "bible_sheet",
  "question": "「独生子」是什么意思？",
  "conversation_id": "uuid-or-null",
  "forced_chunk_ids": []
}
```

**响应（SSE 事件或最终 JSON）：**

```json
{
  "blocks": [
    { "type": "summary", "content": "…" },
    { "type": "citations", "items": [{ "source": "…", "quote": "…" }] }
  ],
  "conversation_id": "uuid"
}
```

---

## 7. 数据库 Schema

### 7.1 Flutter 本地 SQLite（`apps/mobile`）

```sql
-- 经文（从离线包导入，只读）
CREATE TABLE books (
  id TEXT PRIMARY KEY,          -- GEN, JHN
  name TEXT NOT NULL,
  testament TEXT NOT NULL,      -- OT | NT
  sort_order INT NOT NULL,
  chapter_count INT NOT NULL
);

CREATE TABLE verses (
  book TEXT NOT NULL,
  chapter INT NOT NULL,
  verse INT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (book, chapter, verse)
);

CREATE VIRTUAL TABLE verses_fts USING fts5(
  text, book, chapter, verse,
  content='verses', content_rowid='rowid'
);

-- 译本对照（Phase 2 可合并或分表）
CREATE TABLE verses_kjv (
  book TEXT, chapter INT, verse INT, text TEXT,
  PRIMARY KEY (book, chapter, verse)
);

-- 阅读进度
CREATE TABLE reading_progress (
  book TEXT PRIMARY KEY,
  chapter INT NOT NULL,
  verse INT NOT NULL,
  percent REAL NOT NULL DEFAULT 0,
  open_count INT NOT NULL DEFAULT 0,
  last_read_at INT NOT NULL,
  completed_at INT
);

CREATE TABLE reading_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  duration_sec INT NOT NULL DEFAULT 0,
  is_valid INTEGER NOT NULL DEFAULT 0
);

-- 计划
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  total_days INT NOT NULL
);

CREATE TABLE plan_days (
  plan_id TEXT NOT NULL,
  day INT NOT NULL,
  book TEXT, chapter_start INT, verse_start INT,
  chapter_end INT, verse_end INT,
  title TEXT,
  PRIMARY KEY (plan_id, day)
);

CREATE TABLE plan_progress (
  plan_id TEXT PRIMARY KEY,
  current_day INT NOT NULL DEFAULT 1,
  started_at INT,
  paused INTEGER NOT NULL DEFAULT 0
);

-- 用户内容
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  book TEXT, chapter INT, verse INT,
  note TEXT,
  created_at INT NOT NULL
);

CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  book TEXT, chapter INT, verse_start INT, verse_end INT,
  color TEXT NOT NULL,
  created_at INT NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  book TEXT, chapter INT, verse_start INT, verse_end INT,
  title TEXT,
  body TEXT NOT NULL,
  source TEXT,                  -- manual | ai
  ai_conversation_id TEXT,
  created_at INT NOT NULL,
  updated_at INT NOT NULL
);

-- 设置与元数据
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE cross_references (
  from_book TEXT, from_chapter INT, from_verse INT,
  to_book TEXT, to_chapter INT, to_verse INT,
  ref_type TEXT,
  preview TEXT
);

CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL
);
```

### 7.2 PostgreSQL（`services/api`，已有 + 扩展）

**已有（`001_bible_rag.sql`）：**

- `bible_documents`
- `bible_rag_chunks`
- `guest_devices`
- `users`（二期）
- `ai_usage_daily`

**Phase 1 建议追加：**

```sql
CREATE TABLE ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID REFERENCES guest_devices(guest_id),
  scripture_ref TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_feedback (
  message_id UUID PRIMARY KEY REFERENCES ai_messages(id),
  helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.3 云优先用户数据表（M4 · 服务端为真相源）

> 用户数据上服务器（§PRODUCT 2.4）。所有用户表统一带 `user_id` + `version` + `updated_at` + `deleted`（tombstone）+ `server_seq`（单调，供增量游标），支撑 `/sync/pull?since=` 与字段级 LWW 冲突合并。

```sql
-- 单调序列：所有用户表变更共享，作为同步游标
CREATE SEQUENCE user_data_seq;

-- 通用列（每张用户表都含）：
--   id UUID, user_id UUID, version INT, updated_at TIMESTAMPTZ,
--   deleted BOOLEAN DEFAULT false, server_seq BIGINT DEFAULT nextval('user_data_seq'),
--   device_id TEXT, client_ts TIMESTAMPTZ

CREATE TABLE user_note        (id UUID PRIMARY KEY, user_id UUID NOT NULL, ref TEXT, body TEXT, tags TEXT[],
                               version INT, updated_at TIMESTAMPTZ, deleted BOOLEAN DEFAULT false,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'), is_private BOOLEAN DEFAULT false);
CREATE TABLE user_highlight   (id UUID PRIMARY KEY, user_id UUID NOT NULL, ref TEXT, color TEXT,
                               version INT, updated_at TIMESTAMPTZ, deleted BOOLEAN DEFAULT false,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'));
CREATE TABLE user_bookmark    (id UUID PRIMARY KEY, user_id UUID NOT NULL, ref TEXT,
                               version INT, updated_at TIMESTAMPTZ, deleted BOOLEAN DEFAULT false,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'));
CREATE TABLE reading_progress (user_id UUID, book TEXT, chapter INT, verse INT, updated_at TIMESTAMPTZ,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'), PRIMARY KEY(user_id));
CREATE TABLE reading_log      (user_id UUID, date DATE, minutes INT, chapters INT, updated_at TIMESTAMPTZ,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'), PRIMARY KEY(user_id, date));
CREATE TABLE memorize_card    (id UUID PRIMARY KEY, user_id UUID NOT NULL, ref TEXT, srs_state JSONB, due_at TIMESTAMPTZ,
                               version INT, updated_at TIMESTAMPTZ, deleted BOOLEAN DEFAULT false,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'));
CREATE TABLE plan_progress    (user_id UUID, plan_id TEXT, day INT, status TEXT, updated_at TIMESTAMPTZ,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'), PRIMARY KEY(user_id, plan_id));
CREATE TABLE ai_session       (id UUID PRIMARY KEY, user_id UUID NOT NULL, anchor_ref TEXT, title TEXT,
                               version INT, updated_at TIMESTAMPTZ, deleted BOOLEAN DEFAULT false,
                               server_seq BIGINT DEFAULT nextval('user_data_seq'));
CREATE TABLE ai_turn          (id UUID PRIMARY KEY, session_id UUID NOT NULL, q TEXT, a TEXT, created_at TIMESTAMPTZ);
CREATE TABLE user_profile     (user_id UUID PRIMARY KEY, avatar_id TEXT, bio TEXT, username TEXT, user_code TEXT,
                               updated_at TIMESTAMPTZ, server_seq BIGINT DEFAULT nextval('user_data_seq'));
CREATE TABLE sync_cursor      (user_id UUID, device_id TEXT, last_seq BIGINT, PRIMARY KEY(user_id, device_id));
```

> **客户端镜像**：移动端 SQLite / Web IndexedDB 用同名字段 + `pending` 标记（outbox）。私密笔记 `is_private=true` 时正文客户端加密、不参与 RAG/检索。

---

## 8. 团队分工建议

### 8.1 1 人全栈（推荐顺序）

| 周次 | 重心 |
|------|------|
| 1–2 | Phase 0 + Flutter Shell + 本地 DB + 阅读器只读 |
| 3–4 | 首页计划 + 进度埋点 + 笔记 |
| 5–6 | FastAPI + RAG 移植 + 索引 1 本注释 |
| 7–8 | AI 三模式 + 半屏/助手 + 我的页 |
| 9–10 | 联调、修 bug、内测 |
| 11+ | Phase 2 功能 |

### 8.2 2 人：前端 + 后端

| 角色 | 负责 |
|------|------|
| **Flutter** | Shell、阅读器、首页、助手 UI、本地 DB、离线包集成 |
| **Backend** | FastAPI、RAG、AI prompt、数据脚本、PG |

**接口契约先行：** Week 2 冻结 `/guide/passage` 与 `/ai/chat` 的 OpenAPI；前后端 Mock 并行。

**联调节点：** Week 6 第一次端到端 AI；Week 8 内测包。

### 8.3 若有第 3 人（内容/数据）

- 经文本体清洗、EPUB 解析验证
- 注释 `scripture_refs` 标注
- 计划 CSV、专题 JSON、词典扩充

---

## 9. 风险与阻塞项

| 风险 | 影响 | 缓解 |
|------|------|------|
| ~~译本/注释版权~~ | ~~上架驳回~~ | ✅ **直接执行**（授权由业务方落实）；KJV 公有领域 |
| ~~AI 选型/Key~~ | ~~跑不通 RAG~~ | ✅ DeepSeek + DashScope，Key 已配 |
| ~~上云决策~~ | ~~同步无法定型~~ | ✅ 游客本地→登录合并 / 准实时 / E2EE 可选（§2.4.2） |
| ~~域名~~ | ~~部署阻塞~~ | ✅ `www.prestoai.cn`（H5 `/2sc`） |
| ~~新译本 EPUB ≠ 和合本~~ | ~~已解决~~ | ✅ 主译本定为 CNV，`translation_id=cnv` |
| **EPUB 结构不一** | 导入失败 | 先支持你的 EPUB 样本；fallback 开源 JSON |
| **Flutter 未安装** | 无法开发客户端 | `docs/SETUP.md` + `brew install --cask flutter` |
| **注释无章节标签** | RAG 检索差 | 手工 MD 标题 `## 约翰福音 3:16`；二期 LLM 打标 |
| **Embedding/LLM 成本** | 超预算 | 游客限额、缓存、小模型 |
| **minimax 代码耦合** | 移植困难 | 只拷 `rag_core.py` + 薄封装，不拷全 orchestrator |
| **阅读排版复杂** | 工期膨胀 | V1 纯文本；对话/专名 Phase 2 |
| **登录复用 minimax** | 环境未启 auth | 与 podcast 共用 orchestrator；文档 §8.4 |

---

## 10. 第一周执行清单（Day 1–7）

### Day 1：环境

- [ ] 安装 Flutter SDK，执行 `flutter doctor`
- [ ] `cd apps && flutter create --org com.bible.app --project-name bible_app mobile`
- [ ] Python 3.11 venv + `services/api` 骨架 + `/health`
- [ ] `docker compose up` 启动 Postgres，验证 RAG 表存在
- [ ] 创建 `docs/SETUP.md`

### Day 2：数据

- [ ] 确认主译本数据源（EPUB 或 JSON）与版权
- [ ] 实现或跑通 `import_bible.py` → 本地 sqlite
- [ ] 下载/转换 KJV `verses.json`（scrollmapper 开源）
- [ ] 将 sqlite 或 zip 放入 Flutter `assets/` 或模拟下载

### Day 3：Flutter 基础

- [ ] 添加 go_router、drift/sqflite、riverpod
- [ ] 5 Tab `MainScaffold` + 空页面占位
- [ ] 导入经文到 App 内 SQLite
- [ ] `BibleRepository.getChapter(JHN, 3)` 单测

### Day 4：阅读器 V1

- [ ] 章阅读页：顶栏 + 经文列表 + 节号
- [ ] `Aa` 设置：字号 16–24、浅色/深色/护眼
- [ ] 章切换与滚动位置恢复

### Day 5：圣经目录 + 进度

- [ ] 66 卷列表（静态 metadata JSON）
- [ ] 章节列表页
- [ ] 写入 `reading_progress`（最后阅读位置）

### Day 6：首页 + Onboarding 骨架

- [ ] `onboarding_state` 枚举与持久化（S0–S3）
- [ ] S0 下载页 / S1 选计划 / S2 首日 / S3 常规首页
- [ ] 导入 1 套计划 CSV，展示「今日任务」→ 深链圣经阅读页
- [ ] 今日时长（阅读页计时器写 session）

### Day 6b：圣经 Tab 根路由

- [ ] 有 `reading_progress` → Tab 根 = 继续阅读
- [ ] 无进度 → Tab 根 = 书卷目录

### Day 7：后端 RAG 起步 + 周回顾

- [x] 复制 `rag_core.py` → `services/api/app/rag/core.py`（去耦：切块/关键词/cosine/混合排序）
- [x] 单元测试：`split_text_into_chunks` 中文注释（`tests/test_rag_core.py`，10 项通过）
- [x] `EmbeddingProvider` → `app/rag/embedding.py`（DashScope，已联网验证 dim1024）
- [x] `app/rag/index.py` + `retrieve.py` + `scripts/rag_index.py` CLI
- [x] `scripts/commentary_to_md.py`：背景注释 EPUB → 55 篇 .md
- [x] **Postgres 入库 + 检索验证**：55 文档 / 15,031 块入 `bible_rag_chunks`，`--query` 语义命中正确
- [ ] 写下 Week 2 目标：笔记 CRUD + `/guide/passage` Mock

---

## 11. 复用 minimax_aipodcast（RAG + 登录）

> 路径 `/Users/mark/minimax_aipodcast`。以下符号/默认值经源码核对，可直接搬运改造。

### 11.1 RAG 复用

| 模块 | minimax 源 | 复用 | 圣经改造 |
|------|-----------|------|----------|
| 切块 | `services/orchestrator/app/rag_core.py` · `split_text_into_chunks`（默认 **1100 字 / overlap 90**；profile：sheet/pdf/short/long） | 直接搬 | 注释 `per_chapter` 切，标题挂 `## 约翰福音 3:16` |
| Embedding | `EmbeddingProvider`（api/local/hash/**auto**；百炼 **text-embedding-v4 / dim 1024 / batch 10**） | 直接搬 | 仅配 `RAG_EMBEDDING_*`（已配 DashScope） |
| 向量存储 | `note_rag_chunks`（**JSONB 存向量**，内存暴力余弦；非 pgvector） | 搬为 `bible_rag_chunks` | 量大再迁 pgvector |
| 混合检索 | 向量+关键词，权重 **0.55/0.45（临时）· 0.6/0.4（持久）** | 搬 | 过滤 `chapter_filter` → **新建 `scripture_ref` 过滤** |
| 入库 | `note_rag_service.py` · `index_note_for_rag` | 搬为 `index_commentary` | profile=`commentary`（参考 `note_rag_profile.py`） |

### 11.2 登录复用

| 项 | minimax 实现 | 复用 |
|----|-------------|------|
| 端点 | orchestrator `/api/v1/auth/*`（login/register/me/logout，**无 refresh**），`auth_bridge.py` | **共用同一 orchestrator** |
| 会话 | **opaque token（非 JWT）** + Redis/JSON 存储，TTL **7 天** | 照搬 |
| 双端 | Web **BFF HttpOnly Cookie `fym_session`**（`apps/web/lib/authSession.server.ts`）+ Flutter **Bearer** | 照搬：Web `/2sc` Cookie，App Bearer |
| 注册 | **邮箱 OTP 三步** | 复用 |
| 游客/合并 | ⚠️ minimax **无** | **本项目新建**：`guest_devices` + AI 10 次/日 + `merge-guest` |

> 详尽梳理见探查记录 [minimax RAG 与登录方案](476b99dc-13a7-4bec-a277-3d1e05555c78)。

---

## 附录：建议 Flutter 依赖（pubspec）

```yaml
dependencies:
  flutter:
    sdk: flutter
  go_router: ^14.0.0
  flutter_riverpod: ^2.5.0
  drift: ^2.18.0
  sqlite3_flutter_libs: ^0.5.0
  path_provider: ^2.1.0
  dio: ^5.4.0
  flutter_secure_storage: ^9.0.0
  intl: ^0.19.0
  uuid: ^4.0.0
```

## 附录：建议 Python 依赖（requirements.txt）

```
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
psycopg[binary]>=3.1.0
pydantic-settings>=2.2.0
httpx>=0.27.0
python-dotenv>=1.0.0
```

---

## 修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v2.0 | 2026-06-29 | 纳入云优先用户数据（§7.3 服务端用户表 + §6.3 同步接口）、Web/PWA 第二端、AI 选型（DeepSeek+DashScope，Key 已配）、静态数据已生成、域名 `prestoai.cn`；里程碑改 M0–M6 详排（§3）；新增 §11 复用 minimax（RAG/登录）；风险表阻断项全部清除 |
| v1.0 | 2026-06-15 | 初稿：基于当前仓库与产品文档 |
