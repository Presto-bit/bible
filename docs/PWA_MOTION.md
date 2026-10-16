# 彼爱 PWA Motion System v1

> **范围：** iOS Safari PWA + Android 嵌 H5（同套 Web）。  
> **状态：** Phase A–C 已落地（`apps/web`）。  
> **产品摘要：** `docs/PRODUCT.md` §19.7。

## 语义

| ID | 实现 |
|----|------|
| `nav.push` / `nav.pop` | `page-enter-soft`、`useEdgeSwipeBack` 跟手、`runWithViewTransition` |
| `nav.tab` | `.tab-keep-pane-active` → `peiai-tab-fade-in`（160ms） |
| `sheet.present` / `sheet.dismiss` | `MotionSheet`、`ReaderSheetPortal` + `useSheetDrag` |
| `list.stagger` | home / profile / discover stagger |
| `press.scale` | `Pressable` + `.peiai-pressable` |
| `feedback.pop` | `.peiai-feedback-pop` / 首页 like pop |
| `reader.turn` | `useReaderPageTurn`（320ms spring） |
| `hero.shared` | `.peiai-vt-hero` + View Transitions |

## Token

见 `apps/web/styles/design_tokens.css`：

- `--peiai-motion-fast|normal|enter|spring`
- `--peiai-press-scale` / `-icon` / `-card`
- `--peiai-tab-fade`、`--peiai-nav-push-x`、`--peiai-stagger-step`

## 关键文件

| 路径 | 职责 |
|------|------|
| `styles/pwa_motion.css` | 全局动效样式 |
| `lib/peiai_motion.ts` | stagger / VT / haptic 辅助 |
| `lib/use_edge_swipe_back.ts` | 左缘跟手返回 |
| `lib/use_sheet_drag.ts` | 半屏下拖 |
| `components/ui/MotionSheet.tsx` | 统一半屏 |
| `components/ui/Pressable.tsx` | 点击 + 按压 |
| `components/shell/PageTransitionHost.tsx` | 路由入场降级 |
| `components/reader/ReaderSheetPortal.tsx` | 读经半屏跟手 |

## 验收速查

1. 二级页左缘拖：页跟手右移，松手回弹或提交返回。  
2. 半屏：升起有 spring；下拖过阈值关闭。  
3. `Pressable` 按下有缩放。  
4. 发现列表首次进入有 stagger。  
5. 读经翻页松手为 spring 吸附。  
6. 成就 toast 约 400ms scale。  
7. `prefers-reduced-motion: reduce` 下降级位移动画。

## 发版

`surface: h5` · `release: web`
