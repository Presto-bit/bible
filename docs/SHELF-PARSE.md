# 书架解析与排版（定案 · 2026-09-03）

> 入库把文件收成 **flow HTML** 或 **PDF 页流**；阅读器仍只有这两种。用户不感知后缀。
> 阅读契约见 `docs/SHELF-READING.md`。冲突时：手势/chrome 以阅读契约为准，解析以本文为准。

## 1. 目标

- **读懂、坚持读、用得上**：字号行距、左右换节、划线、经文点按、问小爱、续读，对所有「流式书」同一套。
- **保真**：可重排 EPUB 保住章节、强调、诗行、图、注；不是像素还原出版社 12pt 双栏。
- **诚实**：DRM、损坏、扫页漫画 EPUB，拒绝或走 page，不半截正文。

## 2. 两条渲染，两条转换

客户端不新增阅读器。

| 模式 | 进什么 | 节内 |
|---|---|---|
| **flow** | 对话书 HTML、教案 Word、md、txt、可重排 EPUB | 竖滚；字号/行距/字体生效 |
| **page** | 教案 PDF；固定版式 EPUB（若收） | 贴宽连页；捏合缩放 |

转换在**入库**完成，按文件 `sha256` 缓存，阅读只读结果。

```
上传 → 识别类型 / DRM
  可重排 epub / md / txt /（mobi→epub）/ 教案 docx / 对话书 docx
        → 切节 + HTML + 抽图 +（EPUB 另附消毒 CSS）
  PDF / 固定版式 epub / 扫描件 → page
  DRM / 损坏 / 不支持 → 拒绝并说明
→ 管理员预览 TOC 与第一节 → 发布
```

Word 与 EPUB **不要共用同一套剥样式**：

| | Word（教案/对话书） | 可重排 EPUB |
|---|---|---|
| DOM | Mammoth 生成（教案）或 Heading 切节 + Mammoth 节内（对话书） | **尽量保留**章节 XHTML |
| CSS | 剥掉字号宽 float（教案样式不可信） | **消毒后保留语义**，再叠阅读器变量 |
| 切节 | 对话书：Heading / 文前目录；教案：一文件一节 | **nav / spine 一章一节** |

## 3. 可重排 EPUB：保真 + 阅读器功能

可重排书改字号必须重排。「保真」= 结构与语气；阅读器接管字号、行距、纸色、手势。

### 3.1 两层叠在同一棵 DOM

```
章节 XHTML（保 DOM）
  + 作者 CSS（白名单语义）
  + 用户 CSS（--shelf-font-size / line-height / family / ink / paper）
  → 现有 flow 竖滚 + 左右换节
```

与 Kindle / Readium 同一层叠，但**不上 epub.js 分页**，避免第三套手势。

```css
.shelf-epub-root {
  font-size: var(--shelf-font-size);
  line-height: var(--shelf-line-height);
  font-family: var(--shelf-font-family);
  color: var(--ink);
}
/* 作者标题用 em，相对读者字号，层级还在 */
.shelf-epub-root h1 { font-size: 1.15em; }
```

客户端 `ShelfPaginatedProse` 增加 variant `epub`（带消毒 CSS 的 flow），不是新壳。

### 3.2 作者 CSS 白名单 / 必删

| 留（保真） | 删或改写（让位给阅读器） |
|---|---|
| `font-style` / `weight` / `variant` | `font-size` 的 px/pt → 删或改 `em` |
| `text-align`（诗、居中题） | `font-family`（无 CJK 覆盖时） |
| 相对 `margin`、引用左边线 | `width` / `position` / `float` / `column` |
| 列表、表格结构 | 作者 `line-height`、绝对色（映射到 ink/paper） |
| 插图所在 DOM 位置 | 外链、script、iframe |

内嵌字体：含完整 CJK 才可选用；否则书柜宋体/黑体，避免西文精排、中文回退乱跳。

### 3.3 功能挂点（同一 DOM）

| 能力 | 做法 |
|---|---|
| 字号行距字体 | 只改根 CSS 变量；作者 `em` 跟着变 |
| 左右换节 / 目录 / 续读 | nav → L2 section；禁止整本一节 |
| 划线 | **禁止**把语义 div 展平光秃 `<p>`；打 `data-shelf-p`（或后续 CFI） |
| 经文点按 / 问小爱 | 现有 text node linkify + 选区 |
| 图 | 抽出为 `*-inline-*`，改 `src`，可点放大 |
| 脚注 `epub:type=noteref` | 点按章内弹出，不跳转文末 |

### 3.4 做不到的

- 改字号而版面纹丝不动（那是 PDF / 固定版式）
- 出版社 Exact 12pt、双栏、三行首字下沉
- DRM EPUB

## 4. 分格式

### 4.1 教案 Word（`.docx`，kind=lesson）

- **现状**：请求时 Mammoth → HTML + 抽图；标题启发式（`一、` `（一）`）。
- **补强**：按 `sha256` 缓存，勿每 GET 现转；阅读图约 1200px WebP、懒加载；垃圾 alt（如「豆包」）丢掉；文末「图片：」作图库点开，不猜插回哪一段。
- 表格走 `shelf-docx-table`；脚注收文末或弹出；文本框/SmartArt 占位即可。

### 4.2 对话书 Word（入库切节）

- **现状**：`parse_docx_bytes` 只抽 `<w:t>`，换行/强调会丢。
- **定案**：切节仍用 Heading / 文前 TOC；**节内改 Mammoth** + 对话 style map（`Dialogue`、信徒/牧者、继续对话的问题）。入库写 catalog，阅读不现转。

### 4.3 PDF

- 维持 page：贴宽、捏合、儿童书目略放大。
- **不做 OCR 重排**（印好的教案版式即内容）。
- P1：有文字层的 PDF 可复制/划线；扫描件保持看图。

### 4.4 Markdown

- 入库：`#` / `##` 切节；CommonMark → 语义 HTML；图抽出。
- 消毒 raw HTML/script。排版走 prose 类名，不用 GitHub 风主题。

### 4.5 纯文本

- 猜编码（UTF-8 / GBK）；空行分段；墙式无空行按句切开。
- `第x章` / `第x场` 仅作**建议目录**，管理员预览确认后再上架（切错比无目录更糟）。
- 无图无强调；对话书可首行缩进，教案不缩进。

### 4.6 MOBI / AZW

- **不在阅读器内解。** 能转 EPUB 则走 §3；失败则拒绝并说明。禁止当 txt 硬读。

### 4.7 图 / 视频 / 音频

- **正文内嵌图**（Word/EPUB/MD 里的图）：跟读、块级、可放大。
- **课节附件**（`课节stem-用途.mp4`）：素材栏，不进竖滑。抽图文件不要进素材栏（`*-inline-*` 已排除）。
- 视频不自动播。

### 4.8 不进阅读器

`.ppt` / `.pptx` / `.xls` / `.xlsx` / 老 `.doc`：打开原件或预转失败即诚实失败。不做第三套 Office 渲染。

## 5. 阅读排版（flow 统一）

类名可继续用 `shelf-docx-*`，或逐步改名为 `shelf-prose-*`，**禁止**再加 `shelf-epub-prose` 另一套交互。

- 栏宽由阅读器定；两端对齐；教案取消首行缩进，对话书可缩进。
- 经文引用一律 linkify。
- 字号 / 字体族 / 行距：底栏同一 Sheet，作用于所有 flow（含 EPUB）。

## 6. 上架预览（转换质量 = 阅读体验）

发布前管理员必须能看到：

1. 自动 TOC（可改切节）
2. 第一节正文（EPUB：拖一下字号，确认强调还在）
3. 图是否出现、是否过大
4. 失败原因（DRM、乱码、无 spine）

无预览不得把启发式切节直接推给读者。

## 7. 落地顺序

**P0（现有书就痛）**

1. 对话书节内并入 Mammoth，入库缓存。
2. 教案 Word：转换结果按 hash 落盘；图缩小 + 懒加载。
3. 阅读图与正文内嵌图路径保持现有文件接口。

**P1（体验完整）**

4. 教案文末图库；表格/脚注。
5. Markdown + txt 入库（txt 目录需人工确认）。
6. PDF 文字层复制（有层才开）。

**P2（电子书）**

7. 可重排 EPUB：§3 两层 CSS + nav 切节 + 上架预览。
8. MOBI 仅「转 EPUB」，失败拒绝。
9. 固定版式 EPUB：不收，或实验性走 page（默认不收）。

## 8. 不做

- 第三套阅读器（epub.js 仿真翻页、Kindle 壳、漫画阅读器）
- PDF / 扫描 EPUB OCR 重排进 flow（产品已否）
- 阅读器内解 DRM
- 为保真而锁定字号、禁用划线
- 把 EPUB 先剥成 Word 式光秃 HTML 再排版（保真会没）

---

工程入口：入库 `services/api/app/shelf/`；阅读 `apps/web/components/shelf/ShelfPaginatedProse.tsx`、`apps/mobile/lib/features/shelf/shelf_paginated_prose.dart`。
