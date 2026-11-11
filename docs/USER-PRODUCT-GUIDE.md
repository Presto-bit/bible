# 用户向产品说明（维护约定）

面向用户的「产品说明」与「更新记录」以 **单源** 维护，应用内路由：

**`/help/product`**（设置 → 产品说明；欢迎信 CTA 建议链到此页）

## 源文件

| 文件 | 作用 |
|------|------|
| `apps/web/lib/user_product_guide.ts` | 正文 `PRODUCT_GUIDE_SECTIONS` + 更新记录 `PRODUCT_CHANGELOG` |
| `apps/web/app/help/product/page.tsx` | 展示页（样式见 `globals.css` 中 `.product-guide*`） |

安卓/iOS 均在 H5 白名单 `/help` 下，**无需为本文案单独发 APK**。

## 每次产品改动怎么记

1. 判断对用户是否**可感知**（新能力、规则变化、下线、重要文案）。纯重构、无行为变化可不记。
2. 更新记录 **按月一条**（`date` 仅用 `YYYY-MM`，不写具体日）：
   - **当月已有条目**：只往该月 `items` 里追加 bullet（或改写该月文案），不新建第二条。
   - **新的月份**：在 `PRODUCT_CHANGELOG` **数组最前**新增 `{ date, title?, items }`。
   - `title`：可选，该月主题（页面上月份仍以「2026年11月」等形式展示）。
   - `items`：1～5 条 bullet，每条一句完整话，禁内部代号。
3. 若说明正文也要改（如新 Tab、新规则），同步改 `PRODUCT_GUIDE_SECTIONS`。
4. 大改版时更新 `PRODUCT_GUIDE_VERSION`（建议 `YYYY-MM`，与最近更新月份一致）。

## 与内部文档关系

- 规格与评审仍以 [`PRODUCT.md`](./PRODUCT.md) 为准；本页不写实现细节。
- 活动运营见 [`CAMPAIGN-OPS.md`](./CAMPAIGN-OPS.md)；用户侧只在有上线活动时写 changelog 即可。

## 欢迎信文案（参考）

会话 notice 短文案可指向本页，例如：

> 你好，欢迎来彼爱读经 App。这里有小爱帮你解释经文，可以和同路人共读，浏览属灵书籍，探索圣经里有意思的主题，也能分享你的观点。更多用法请看产品说明；有问题随时在这里回复我们。

链接：`/help/product`
