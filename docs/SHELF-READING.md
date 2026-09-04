# 书架阅读契约（PWA · 2026-09-02）

> 彼爱书架：平台书目、教案、PDF。与圣经 Tab 经章阅读 **结构导航同构**，节内均为 **竖向阅读**。
>
> 解析 / 入库 / EPUB 保真：`docs/SHELF-PARSE.md`。

## 1. 使命与气质

- **安静阅读，在话语中相遇**；一屏一事，阅读器内无信息流、无 guilt。
- 用户不感知后缀；只感知：**上下读内容，左右换目录节**。

## 2. 三层结构

| 层 | 含义 | 示例 |
|----|------|------|
| L1 书目 | 一本平台书 / 教案集 | 《恩典的安慰…》 |
| L2 目录节 | TOC 可点的 section | 第三单元 · 第一周 |
| L3 节内位置 | 续读锚点 | PDF 页码；HTML/Word 滚动比例 |

## 3. 手势契约（PWA 定案）

| 手势 | 行为 |
|------|------|
| **上下滑** | 节内阅读（HTML/Word 流式竖滚；PDF 贴宽连页竖滚）；**不**因滑到节末/首自动切节 |
| **左右滑** | **切换目录节**，落到目标节 **开头**（不在节内横翻页） |
| **点按正文** | 切换顶栏 / 底栏 chrome（无 3s 自动隐藏） |
| **全书尽头** | 末节再右滑：轻 Toast「读完了…」并引导书评；无排行榜 |

与圣经 Tab 对齐：**左右换结构单位，上下读内容**（圣经 = 卷章；书架 = 目录节）。

## 4. 渲染模式

客户端仅两种节内渲染器，共用同一 **ReaderShell**（顶栏 / 底栏 / 目录 / 字体 / 分享）：

| 模式 | 格式 | 节内 |
|------|------|------|
| **flow** | HTML、Word、md、txt、可重排 EPUB（均 → prose） | 单栏流式，`overflow-y: auto` |
| **page** | PDF（固定版式 EPUB 若收则同此） | 贴宽默认，页片纵向堆叠；可捏合缩放 |

`docx` / `epub` 仅为 flow 的 **排版 variant**（docx 剥 Office 样式；epub 保留消毒后的语义 CSS），不是另一套交互。禁止 epub.js 分页第三壳。

## 5. 阅读设置（统一入口）

底栏 **字体** 打开同一 Sheet：

- 字号 · 字体族（衬线/黑体）· 行间距 → 作用于 **flow**
- PDF 缩放/贴宽/适页 → 同一 Sheet 内 **「版式」** 分区（或正文区浮层，二选一实现）

禁止按格式散落多套工具条。

## 6. 进度与续读

本地键 `presto_shelf_progress_v1`：

```ts
{
  sectionId: string;
  pageIndex?: number;      // PDF：0-based 页
  scrollOffset?: number;   // flow：0–1 滚动比例
}
```

- 书架列表 / Profile 续读卡 / 分享 ref：共用上述结构。
- 云端同步：P2； schema 同上。

## 7. 教案素材与正文插图

- **课节附件**（视频、图卡）：**素材** FAB + Sheet，不进主阅读流，避免与竖滑抢手势。
- **正文内嵌图**（Word / EPUB / MD 里的图）：跟读，块级展示；与附件不是同一类。

## 8. 双端范围

| 端 | 本契约 |
|----|--------|
| **PWA（iOS + Web）** | ✅ 本文档 + `apps/web/components/shelf/*` |
| **Android Flutter** | 独立跟进；目标行为与本文档一致 |

## 9. 不做

- 节内横翻页（除未来显式 `layout: paginated` 书目级开关，默认关）
- 第三套 EPUB/Kindle 仿真翻页器
- PDF / 扫描件 OCR 重排
- 公开阅读排行
- 阅读器内 IM / 弹幕

## 10. 首次引导

首次进入任意书架阅读器：一次性 Toast「上下滑动阅读，左右切换章节」，写 `localStorage.shelf_reading_hint_v1`，不重复打扰。

---

工程入口：`apps/web/components/shelf/ShelfReader.tsx` · 样式 `apps/web/styles/shelf.css` · 解析定案 `docs/SHELF-PARSE.md`
