# PWA 与安卓分发

以 **iOS Safari「添加到主屏幕」** 为视觉基准；安卓安装包为 **Flutter**（见产品 §24）。

## 安装引导

| 平台 | 主路径 |
|------|--------|
| **iOS** | Safari「添加到主屏幕」 |
| **Android** | 官网 **Flutter APK**（`apps/mobile` 构建）；发现/IM 等嵌 **H5 白名单** |
| 微信 / QQ | 先逃逸系统浏览器再安装 |

- 组件：`components/InstallPwaGuide.tsx`
- 历史壳（`android-twa` / `android-pwa-host`）：**非主分发**；用户引导覆盖装 Flutter 包
- H5 白名单：`lib/h5_whitelist.ts`（与 `apps/mobile/lib/core/h5_whitelist.dart` 同步）
- Flutter 壳登录桥：`lib/flutter_h5_bridge.ts`（`presto_session_token`）

## Shorebird（仅安卓壳）

- **用途**：闪退、提醒、推送、桥、原生读经小修  
- **禁止**：用热更发布 IM / 活动 / 协议等业务（业务走 Web 部署）  
- 发版标：`web` | `shorebird` | `full_apk`

## 图标与名称

见下文历史字段；`npm run generate-pwa` 生成资源。常量：`lib/pwa_brand.ts`。

| 平台 | 显示 |
|------|------|
| iOS 主屏幕 | **彼爱** |
| Android / Manifest | **彼爱** |
| 副标题 | **安静读经** |

主稿：`../../icon.png`；脚本 `scripts/generate_pwa_assets.mjs`。

## 生效

业务热更以 **Web 部署** 为准（含嵌 H5 的安卓发现）。Flutter 壳 / Shorebird / 整包仅在壳层变更时需要。
