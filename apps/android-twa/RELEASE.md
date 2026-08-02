# 彼爱 Android TWA：发版与同步更新

业务代码在 Web；多数迭代**不用重打 APK**。只有壳/签名/版本元数据变更时才走本流程。

## 何时需要重打 APK

| 变更 | 要不要打 APK |
|------|----------------|
| 读经 / 小爱 / UI / 文案（纯 Web） | 否，发 Web 即可 |
| 换图标、开屏、包名、签名证书 | 是 |
| 升 `versionCode` 提示用户覆盖安装 | 是 |
| Digital Asset Links 证书指纹变更 | 是（并更新 assetlinks.json） |

## 标准打包同步（推荐）

在仓库根目录：

```bash
# 1. 升版本（每次要用户覆盖安装时 +1）
# 编辑 apps/android-twa/app/build.gradle.kts
#   versionCode += 1
#   versionName = "1.0.x"

# 2. 打 release 并同步到 Web 静态目录
cd apps/android-twa && ./scripts/build_and_publish.sh

# 3. 提交产物（apk / peiai-android.json / assetlinks.json）与代码一起发版
git add apps/web/public/downloads apps/web/public/.well-known \
  apps/android-twa/app/build.gradle.kts apps/android-twa/twa-manifest.json
git commit -m "Bump Peiai Android TWA to x.y.z"
bash scripts/publish.sh
```

`build_and_publish.sh` 会：

1. `assembleRelease` 签名打包  
2. 复制到 `apps/web/public/downloads/peiai-android.apk`  
3. 写 `peiai-android.json`（versionCode / sha256 / bytes）  
4. 按当前证书刷新 `/.well-known/assetlinks.json`

## 密钥

- `apps/android-twa/keystore/*.jks` 与 `keystore.properties` **不进 git**，服务器/本机需保留同一上传密钥  
- 换签后必须：新 APK + 新 assetlinks 指纹，旧包用户无法用新签覆盖时需卸载重装

## 用户侧更新体验

- **Web 功能**：已装 TWA 用户打开 App 即拿最新站，无需重装  
- **壳更新**：同 URL 下载新 APK 覆盖安装（同签名）；引导文案可提示「有新安装包」  
- 可选二期：读 `peiai-android.json` 的 `versionCode`，大于本机则出「更新彼爱」按钮

## 发版后自检

见 [SMOKE.md](./SMOKE.md)。至少确认：

```bash
curl -sI https://2sc.prestoai.cn/.well-known/assetlinks.json | head -5
curl -sI https://2sc.prestoai.cn/downloads/peiai-android.apk | head -8
curl -s https://2sc.prestoai.cn/downloads/peiai-android.json
```
