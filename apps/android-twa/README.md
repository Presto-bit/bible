# 彼爱 Android 安装壳

全屏 **WebView** 打开 `https://2sc.prestoai.cn`，**无浏览器地址栏、无其它标签页**。  
安装包由站点同域直装，不走应用商店。

> 说明：旧版为 Chrome TWA；国内机常校验失败会降级成 Custom Tabs（有地址栏）。  
> 自 **1.0.2** 起：纯 WebView 壳。**1.0.3** 起安全区适配。**1.0.4** 起：壳内 APK 更新安装、错误页重试、文件选择与状态栏桥接。

## 包信息

| 项 | 值 |
|----|-----|
| applicationId | `cn.prestoai.peiai` |
| 应用名 | 彼爱 |
| 主入口 | `MainWebActivity` |
| startUrl | `https://2sc.prestoai.cn/` |
| User-Agent 标记 | `PeiaiAndroidShell/…`（站点据此识别为 standalone） |
| JS Bridge | `PeiaiShell.retry` / `setLightStatusBars` |

## 产品策略

- **安卓**：主推官网安装包（APK），**不推**浏览器「添加到主屏幕」
- **iOS**：继续 Safari「添加到主屏幕」
- **壳内升级**：点站内 APK 链接会经壳下载并用系统安装器更新

## 本地构建

```bash
# 1. 配置签名（首次）
cp keystore/keystore.properties.example keystore/keystore.properties
# 编辑密码；或使用已有 peiai-upload.jks

# 2. 确认 local.properties 中 sdk.dir

# 3. 打 release APK 并同步到 Web 静态目录
./scripts/build_and_publish.sh
```

产物：

- `app/build/outputs/apk/release/app-release.apk`
- 复制为 `apps/web/public/downloads/biai-android.apk`
- 更新 `apps/web/public/downloads/biai-android.json`
- Digital Asset Links：`apps/web/public/.well-known/assetlinks.json`（用于 App Links）

## 密钥

- `keystore/*.jks` 与 `keystore.properties` **不进 git**
- 换签后必须更新 `assetlinks.json` 中的 `sha256_cert_fingerprints`

## 已装旧版（TWA 有地址栏）

请 **卸载** 后从官网重新下载安装 **1.0.4+**，才会具备边到边适配与壳内更新安装。

## 发版与更新

见 [RELEASE.md](./RELEASE.md)：多数业务只发 Web；壳变更时 `./scripts/build_and_publish.sh` 同步 APK + meta + assetlinks。
