# PWA 图标与名称

以 **iOS Safari「添加到主屏幕」** 为视觉基准；Android / 桌面共用同一套 `icon.svg` 导出，不做单独 Android 风格。

## 主视觉源文件

| 文件 | 说明 |
|------|------|
| `../../icon.png` | **唯一主稿**（红底窄门 + BIBLE） |
| `scripts/generate_pwa_assets.mjs` | 从 PNG 批量导出图标与启动图 |

```bash
cd apps/web && npm run generate-pwa
```

## 主屏名称

| 平台 | 显示 |
|------|------|
| iOS 主屏幕 | **彼爱**（`appleWebApp.title`） |
| Android / Manifest | **彼爱**（`short_name`） |
| 副标题 | **安静读经**（启动图 + `description`） |

常量：`lib/pwa_brand.ts`、`lib/brand.ts`

## 导出文件

| 文件 | 用途 | 尺寸 |
|------|------|------|
| `apple-touch-icon.png` | iOS 主屏幕 | 180×180 |
| `apple-touch-icon-167.png` | iPad | 167×167 |
| `icon-192.png` | PWA any | 192×192 |
| `icon-512.png` | PWA any | 512×512 |
| `icon-maskable-512.png` | Android 自适应（同源缩进 64%） | 512×512 |
| `splash-iphone*.png` | iOS 启动图（极简品牌屏） | 见脚本 |

## PWA 背景色

全站壳层：`--pwa-bg: #FFFCFA`（应用内背景）；开屏红底 `#E32626` 仅用于 manifest `background_color` 与 iOS startup 图。

同步至：`manifest.webmanifest`、`layout` viewport、启动图、Standalone 首屏。

## 启动图

- 策略：**品牌开屏**（icon.png 图形 + 彼爱 + 安静读经，红底 `#E32626`）
- 设计基准：iPhone 15/16 逻辑 **393×852 @3x**
- 其它机型：脚本等比生成 + `apple-touch-startup-image` media 查询

## 安装引导

- 组件：`components/InstallPwaGuide.tsx`
- **Android 主路径：安装包直装**（`/downloads/peiai-android.apk`，WebView 全屏壳，不跳应用商店）；「添加到主屏幕」降为次要
- iOS：仍为 Safari「添加到主屏幕」
- 微信 / QQ：引导「用浏览器打开再安装」
- 入口：底部 Banner、「我的 → 设置 → 安装彼爱」、新手/读后引导
- 壳工程与冒烟：`apps/android-twa/`（见 README / SMOKE.md；主入口为 WebView 壳）
- Digital Asset Links：`public/.well-known/assetlinks.json`（App Links）

## Standalone 对齐

- 竖屏：`manifest orientation: portrait-primary`
- 外链：`lib/pwa_nav.ts` 同 tab 打开
- 发版 QA：`PWA_STANDALONE_QA` 清单（`lib/pwa_nav.ts`）

## 生效

替换 `icon.svg` 后运行 `npm run generate-pwa`，构建部署。已安装用户需**删除旧快捷方式后重新添加**才能更新图标。Android 安装包用户业务更新随 Web 部署生效，无需重装 APK（壳改动 / 换签除外）。
