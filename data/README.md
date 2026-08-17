# 静态数据目录

将下列文件放入对应子目录。大文件（完整经文 SQLite）建议加入 `.gitignore`，用脚本生成。

## 已生成的真实数据（2026-06-29）

| 文件 | 生成脚本 | 内容 |
|------|----------|------|
| `plans/gospels_30.csv` / `new_testament_90.csv` / `bible_year_365.csv` | `scripts/build_plans.py` | 读经计划，按 66 卷规范章数均分（共 89 / 260 / 1189 章） |
| `plans/prayer_acts_30.json` | 手工原创 | 祷告计划 · 30 天 ACTS（敬拜/认罪/感恩/祈求）逐日内容 |
| `daily-verses/daily_verses.json` | `scripts/build_daily_verses.py` + `scripts/enrich_daily_verses.py` | 365 条每日经文（`text=null`，由经库解析填充） |
| `crossrefs/cross_references.json` | 手工策划 | 30 组主题/呼应交叉引用起步集 |
| `dictionary/entities.json` | `scripts/import_entities.py` + 手工策划 | 人名/地名/专词 |
| `dictionary/relations.json` | `scripts/import_relations.py` | 词典关系图（规范 ID，含来源） |
| `dictionary/relations.curated.json` | 手工策划 | 可溯源经文的正式关系种子 |
| `dictionary/relation_candidates.json` | `scripts/import_relations.py` | 外部候选，审核前不展示 |
| `dictionary/relation_candidates.approved.json` | 人工审核 | 已通过的候选 `source_id` |
| `dictionary/id_aliases.json` | `scripts/import_relations.py` | 历史 ID → canonical |
| `illustrations/theme_*.svg` (20) + `index.json` | `scripts/build_illustrations.py` | 低饱和主题插画（每日经文 hero / 专题卡），16:9 矢量 |

> 经文 `text` 一律由 CNV 经库按 `book/chapter/verse` 解析填充，脚本不手写译本文字，避免串字。
> 重新生成：`python3 scripts/build_plans.py && python3 scripts/build_daily_verses.py && python3 scripts/build_illustrations.py`

## 目录说明

| 目录 | 内容 | 格式 |
|------|------|------|
| `bible/cnv/` | 圣经新译本（CNV）主译本 | `verses.json` / `*.epub` |
| `bible/kjv/` | KJV 英文对照 | `verses.json`（scrollmapper 生成） |
| `dictionary/` | 人名、地名、专词与关系 | `entities.json` / `relations.json` |
| `crossrefs/` | 交叉引用 | `cross_references.json` |
| `plans/` | 读经计划 | CSV |
| `daily-verses/` | 每日经文 365 条 | `daily_verses.json` |

## 离线经包（v1.3）

默认 **一次下载** 包含 **CNV + KJV** 双译本，打包为 App 可导入的离线包（或双 SQLite）。

| 路径 | 说明 |
|------|------|
| `bible/cnv/圣经新译本.epub` | 中文主译本源 |
| `bible/kjv/The Holy Bible (KJV).epub` | 英文对照源（已弃用，改用 scrollmapper） |

KJV 经库由 scrollmapper 公版 JSON 生成，不再依赖 EPUB：

```bash
python scripts/import_kjv_scrollmapper.py --sqlite build/bible_kjv.sqlite
```

旧 EPUB 流程（仅 CNV 仍使用）。

## 经文 JSON 格式

`bible/cnv/verses.json`、`bible/kjv/verses.json`：

```json
{
  "translation": "cnv",
  "verses": [
    { "book": "JHN", "chapter": 3, "verse": 16, "text": "“　神爱世人，甚至把他的独生子赐给他们……" }
  ],
  "books": [
    { "id": "GEN", "name": "创世记", "testament": "OT", "order": 1, "chapter_count": 50 }
  ]
}
```

书卷代码用 USFM 风格缩写：`GEN`, `EXO`, …, `JHN`, `REV`（共 66）。CNV 文本保留神名前的全角敬空 `　`。

> 生成实测：CNV = 66 卷 / 1189 章 / 31077 节（精确）；KJV = 66 卷 / 31102 节（scrollmapper，结构标准）。

## 词典格式

`dictionary/entities.json`：

```json
[
  {
    "id": "nicodemus",
    "name": "尼哥底母",
    "type": "person",
    "summary": "法利赛人中的官，后来暗中作耶稣的门徒。",
    "refs": ["JHN 3:1", "JHN 7:50", "JHN 19:39"]
  }
]
```

## 词典关系

`dictionary/relations.json` 由 `scripts/import_relations.py` 生成（schema `relations@3`）。每条边使用 `entities.json` 的 canonical `id`：

```json
{
  "from": "abraham",
  "to": "以撒",
  "type": "parent",
  "label": "父亲",
  "refs": ["GEN 22:2"],
  "source": "gnosis",
  "source_id": "gnosis:Abraham->Isaac",
  "confidence": "high"
}
```

- 正式关系来源：手工 `relations.curated.json` + Gnosis 族谱（CC-BY-SA，https://github.com/spearssoftware/gnosis）。
- 来源 allowlist 见 `scripts/lib/relation_sources.py`；未启用或许可证不可记录的数据源不会写入正式图。
- 地点等非族谱外部边先写入 `relation_candidates.json`。把已核对的 `source_id` 填入 `relation_candidates.approved.json` 后再导入，才会并入 `relations.json`。
- 未解析/同名歧义写入 `relation_review.json`，导入脚本禁止静默猜测。
- 历史 ID / 别名映射：`dictionary/id_aliases.json`（由导入脚本生成），API 先解析再按 canonical ID 查边。
- 校验：`python scripts/validate_relations.py`（断链为 0、核心专题 ≥5 边、人物覆盖率）。
- 重新生成：`python scripts/import_relations.py`；离线包需再跑 `scripts/build_offline_pack.py` 才会带上新关系。
- 署名：正式关系图含 Gnosis CC-BY-SA；产品侧 `content_attribution()` 亦列出 Gnosis。

## 读经计划 CSV

`plans/new_testament_30.csv`：

```csv
plan_id,day,book,chapter_start,verse_start,chapter_end,verse_end,title
new_testament_30,1,MAT,1,1,1,17,马太福音 1:1-17
new_testament_30,2,MAT,1,18,2,12,马太福音 1:18-2:12
```

## 数据流水线命令（已实现）

```bash
# 1) CNV：EPUB → verses.json
python scripts/epub_to_verses.py --epub data/bible/cnv/圣经新译本.epub \
    --translation cnv --format cnv --out data/bible/cnv/verses.json

# 1b) KJV：scrollmapper → verses.json + sqlite
python scripts/import_kjv_scrollmapper.py --sqlite build/bible_kjv.sqlite

# 2) verses.json → 离线 SQLite（books + verses + FTS5）
python scripts/import_bible.py --input data/bible/cnv/verses.json --out build/bible_cnv.sqlite

# 3) 词典关系（Gnosis 族谱 + 手工种子）
python scripts/import_relations.py
python scripts/validate_relations.py
```

产物 `build/bible_*.sqlite`（约 12–13 MB，已 gitignore）供 Flutter `assets/` 打包或离线下载。完整步骤见 [docs/SETUP.md](../docs/SETUP.md)。
