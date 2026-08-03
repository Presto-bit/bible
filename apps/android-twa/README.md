# 彼爱 Android 安装壳

全屏 **WebView** 打开 `https://2sc.prestoai.cn`，**无浏览器地址栏、无其它标签页**。  
安装包由站点同域直装，不走应用商店。

> 说明：旧版为 Chrome TWA；国内机常校验失败会降级成 Custom Tabs（有地址栏）。  
> 自 **1.0.2 / versionCode 3** 起：纯 WebView 壳（去掉 TWA 依赖），主入口不再打开系统浏览器。

## 包信息

| 项 | 值 |
|----|-----|
| applicationId | `cn.prestoai.peiai` |
| 应用名 | 彼爱 |
| 主入口 | `MainWebActivity` |
| startUrl | `https://2sc.prestoai.cn/` |
| User-Agent 标记 | `PeiaiAndroidShell/…`（站点据此识别为 standalone） |

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

请 **卸载** 后从官网重新下载安装 1.0.1+，才会切换到 WebView 壳。

## 发版与更新

见 [RELEASE.md](./RELEASE.md)：多数业务只发 Web；壳变更时 `./scripts/build_and_publish.sh` 同步 APK + meta + assetlinks。
