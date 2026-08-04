# 彼爱 Android WebView 壳（已冻结）

> **此工程已冻结，不再作为安卓安装主路径。**  
> 现行方案见 [`../android-pwa-host`](../android-pwa-host)：官网 APK + **Chrome Trusted Web Activity**（与 iOS PWA 同属浏览器运行时）。

## 冻结说明（Phase 0）

- **禁止**在本目录叠加手势补丁、半屏特判、新 JS Bridge API。
- 仅允许 P0 崩溃修复；功能与发版请改 `android-pwa-host`。
- 目录名 `android-twa` 为历史遗留；自 1.0.2 起曾为全屏 System WebView 壳。

## 历史包信息（归档）

| 项 | 值 |
|----|-----|
| applicationId | `cn.prestoai.peiai`（与新宿主同包名，可覆盖安装） |
| 末版 WebView 壳 | 1.0.11 / versionCode 12 |
| 替代工程 | `apps/android-pwa-host`（2.0.0+） |

已装旧 WebView 壳用户：从官网下载 **2.0.0+** 覆盖安装即可（签名不变）。

## 为何退役

System WebView ≠ Chrome/Safari；触控合成、SW 更新与 iOS PWA 不一致，导致反复补丁。新架构：**分发用 APK，渲染用 Chrome**。
