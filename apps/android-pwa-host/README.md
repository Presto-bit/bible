# 彼爱 Android Chrome Host（官网安装包）

**分发用 APK，渲染用 Chrome。** 与 iOS Safari「添加到主屏幕」同属浏览器 standalone 运行时。

| 项 | 值 |
|----|-----|
| applicationId | `cn.prestoai.peiai` |
| 应用名 | 彼爱 |
| 当前版本 | **2.0.0** / `versionCode` **20** |
| 运行时 | Chrome Trusted Web Activity（androidbrowserhelper） |
| startUrl | `https://2sc.prestoai.cn/`（附带 `peiai_host` 标记） |
| 能力桥 | `peiai://host/v1/*`（提醒 / 通知设置 / APK 更新） |
| 分发 | 站点同域直装，不走应用商店 |

## 产品策略

- **安卓**：主推官网安装包（本工程）
- **iOS**：Safari「添加到主屏幕」
- **业务更新**：只发 Web；仅容器 / 提醒宿主 / 签名变更时重建 APK
- **明确不做**：System WebView 渲染、社交原生通知中心、为安卓再造一套 IM

## 本地构建

```bash
cp keystore/keystore.properties.example keystore/keystore.properties
# 配置签名；或沿用 peiai-upload.jks

./scripts/build_and_publish.sh
```

产物：

- `apps/web/public/downloads/biai-android.apk`
- `apps/web/public/downloads/biai-android.json`
- `apps/web/public/.well-known/assetlinks.json`
- `apps/android-pwa-host/host-manifest.json`

**体验红线**：`assetlinks.json` 指纹必须与签名一致，否则 Chrome 会露出地址栏。

## 能力宿主白名单

| 路径 | 作用 |
|------|------|
| `peiai://host/v1/scheduleReminder?...` | 本地准点提醒 |
| `peiai://host/v1/cancelReminder?kind=` | 取消提醒 |
| `peiai://host/v1/requestNotifications` | 通知权限 / 设置 |
| `peiai://host/v1/openAppSettings` | 应用详情 |
| `peiai://host/v1/openBatterySettings` | 电池优化 |
| `peiai://host/v1/installApk?url=` | 同域 APK 覆盖安装 |

## 与旧工程关系

- [`../android-twa`](../android-twa)：**已冻结**（历史 System WebView 壳）
- 同包名同签名，用户可从 1.x **覆盖安装** 到 2.0+

## 发版与冒烟

- [RELEASE.md](./RELEASE.md)
- [SMOKE.md](./SMOKE.md)
