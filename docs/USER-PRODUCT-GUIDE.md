# 用户向产品说明（维护约定）

面向用户的「产品说明」以 **单源** 维护，应用内路由：

**`/help/product`**（我的 → 产品说明；欢迎信可链到此页）

## 源文件

| 文件 | 作用 |
|------|------|
| `apps/web/lib/user_product_guide.ts` | 正文 `PRODUCT_GUIDE_SECTIONS` |
| `apps/web/app/help/product/page.tsx` | 展示页（样式见 `shared_chrome.css` 中 `.product-guide*`） |

安卓/iOS 均在 H5 白名单 `/help` 下，**无需为本文案单独发 APK**。

## 每次产品改动怎么记

1. 判断对用户是否**可感知**（新能力、规则变化、下线、重要文案）。纯重构、无行为变化可不记。
2. 若说明正文需更新（如新入口、新规则），修订 `PRODUCT_GUIDE_SECTIONS` 对应章节；语气面向用户、正式克制，避免内部术语。
3. 较大改版时更新 `PRODUCT_GUIDE_VERSION`（`YYYY-MM`），页脚展示为「文档修订 YYYY年M月」。

## 与内部文档关系

- 规格与评审仍以 [`PRODUCT.md`](./PRODUCT.md) 为准；本页不写实现细节。
- 活动运营见 [`CAMPAIGN-OPS.md`](./CAMPAIGN-OPS.md)。
