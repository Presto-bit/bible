# 彼爱 App 图标定稿 · 窄门

## 概念

**窄门** —— 引自「引到永生，那门是窄的，路是小的」（太 7:13–14）。

图形语言：
- **左右门柱**：两个独立个体（彼此），`#4F6B5D`
- **中间窄缝**： intentionally 窄（约 11% 画布宽），不是宽 portal
- **缝内暖光**：正形光柱 + 淡晕 + 中心金点，象征在窄处相遇、同在

情绪：**偏门 · 相遇 · 同在 · 进深**

## 禁用

无字、无书、无十字、无教堂尖拱、无五饼二鱼、无四边闭合画框。

## 色彩

| 用途 | 色值 |
|------|------|
| 背景 | `#FFFCFA` |
| 门柱 | `#4F6B5D` |
| 光柱 | `#FFFDF8` → `#F5E6C8` |
| 光晕 | `#EEF4F0` |
| 中心点缀 | `#B08A4F` @ 32% |

## 源文件

- 主稿：`apps/web/public/icon.svg`（512 viewBox，可无损放大至 1024）

## 导出

```bash
# 需 librsvg 或 Inkscape
rsvg-convert -w 1024 -h 1024 apps/web/public/icon.svg -o apps/web/public/icon-512.png
rsvg-convert -w 192 -h 192 apps/web/public/icon.svg -o apps/web/public/icon-192.png
rsvg-convert -w 180 -h 180 apps/web/public/icon.svg -o apps/web/public/apple-touch-icon.png
```

## 小图自检

- 60×60：两 dark 柱 + 中间亮缝，不可像 `||` 暂停符（缝须为单 pill、圆端）
- 29×29：仍可见中间高光
