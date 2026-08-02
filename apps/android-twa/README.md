# 彼爱 Android TWA

薄壳打开 `https://2sc.prestoai.cn`，无浏览器地址栏。安装包由站点同域直装，不走应用商店。

## 包信息

| 项 | 值 |
|----|-----|
| applicationId | `cn.prestoai.peiai` |
| 应用名 | 彼爱 |
| startUrl | `https://2sc.prestoai.cn/` |

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
- 复制为 `apps/web/public/downloads/peiai-android.apk`
- 更新 `apps/web/public/downloads/peiai-android.json`
- Digital Asset Links：`apps/web/public/.well-known/assetlinks.json`（SHA-256 须与签名证书一致）

## 密钥

- `keystore/*.jks` 与 `keystore/keystore.properties` **不进 git**
- 换签后必须更新 `assetlinks.json` 中的 `sha256_cert_fingerprints`

## 发版与更新

见 [RELEASE.md](./RELEASE.md)：多数业务只发 Web；壳变更时 `./scripts/build_and_publish.sh` 同步 APK + meta + assetlinks。
