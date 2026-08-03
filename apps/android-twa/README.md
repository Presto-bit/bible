# 彼爱 Android 安装壳（WebView）

> **目录名 `android-twa` 为历史遗留**（曾用 Chrome Trusted Web Activity）。  
> 自 **1.0.2** 起实现为全屏 **WebView** 壳，加载 `https://2sc.prestoai.cn`，无地址栏、无多标签。

安装包由站点同域直装，不走应用商店。

## 版本纪要

| 版本 | 要点 |
|------|------|
| 1.0.2+ | 纯 WebView（替代真 TWA / Custom Tabs） |
| 1.0.4+ | 壳内覆盖安装 APK |
| 1.0.8 | Bridge 仅本域、拒定位空放行、临时 WebView 回收、回前台催 SW、电池优化引导、H5 更新半屏 |
| **1.0.9** | 品牌开屏；首帧安全区烘焙；回前台不再硬刷首页；禁 Auto Backup / 混合内容；UA 暴露 versionCode |

## 包信息

| 项 | 值 |
|----|-----|
| applicationId | `cn.prestoai.peiai` |
| 应用名 | 彼爱 |
| 主入口 | `MainWebActivity` |
| startUrl | `https://2sc.prestoai.cn/` |
| User-Agent | `PeiaiAndroidShell/{versionName} (vc{versionCode})` |
| JS Bridge | `PeiaiShell.*`（仅本域） |
| 元数据文件 | `twa-manifest.json`（文件名历史遗留；`generatorApp=manual-webview-shell`） |

`backgroundColor`（#E32626）= 冷启动红底；`themeColor`（#FFFCFA）= 进站后纸色壳层。

## 产品策略

- **安卓**：主推官网安装包（APK），**不推**浏览器「添加到主屏幕」
- **iOS**：继续 Safari「添加到主屏幕」
- **壳内升级**：点站内 APK 链接会经壳下载并用系统安装器更新
- **业务更新**：只发 Web；壳逻辑变更才重建 APK

## 本地构建

```bash
# 1. 配置签名（首次）
cp keystore/keystore.properties.example keystore/keystore.properties
# 编辑密码；或使用已有 peiai-upload.jks

# 2. 确认 local.properties 中 sdk.dir

# 3. 打 release APK 并同步到 Web 静态目录 + twa-manifest
./scripts/build_and_publish.sh
```

产物：

- `apps/web/public/downloads/biai-android.apk`
- `apps/web/public/downloads/biai-android.json`
- `apps/web/public/.well-known/assetlinks.json`
- `apps/android-twa/twa-manifest.json`（版本字段随构建同步）

## 密钥

- `keystore/*.jks` 与 `keystore.properties` **不进 git**
- 换签后必须更新 `assetlinks.json` 中的 `sha256_cert_fingerprints`

## 已装旧版（真 TWA 有地址栏）

请 **卸载** 后从官网重新下载安装 **1.0.4+**（推荐当前 **1.0.9+**）。

## 发版与冒烟

- [RELEASE.md](./RELEASE.md)
- [SMOKE.md](./SMOKE.md)
