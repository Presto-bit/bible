# 彼爱 Android 壳：发版与同步更新

## 壳 vs 站点

| 变更类型 | 是否需重建 APK | 是否需卸载重装 |
|----------|----------------|----------------|
| 站点功能 / Web UI | 否 | 否（打开即新站；壳回前台会催 SW） |
| 壳 WebView / 启动逻辑 / 权限 | 是 | `versionCode` 递增后覆盖安装即可；H5 会半屏提示 |
| 签名证书变更 | 是（并更新 assetlinks.json） | 必须卸载重装 |

当前壳版本见 `app/build.gradle.kts`。  
`./scripts/build_and_publish.sh` 会同步：`downloads/biai-android.json`、`assetlinks.json`、`twa-manifest.json`。

## 发版壳包

```bash
# 先 bump apps/android-twa/app/build.gradle.kts 的 versionCode / versionName
cd apps/android-twa && ./scripts/build_and_publish.sh

# 提交产物（apk / biai-android.json / assetlinks.json）与代码一起发版
git add apps/web/public/downloads apps/web/public/.well-known \
  apps/android-twa/app/build.gradle.kts apps/android-twa/twa-manifest.json
git commit -m "Bump Peiai Android shell to x.y.z"
```

## 无地址栏验收

- [ ] 从桌面「彼爱」图标打开，**无**顶部网址栏  
- [ ] **无**浏览器其它标签 / 多标签切换条  
- [ ] 系统任务卡片显示「彼爱」而非「Chrome」  
- [ ] Web 侧不再自动弹出「安装彼爱」（UA 含 `PeiaiAndroidShell`）

## 密钥

- `apps/android-twa/keystore/*.jks` 与 `keystore.properties` **不进 git**  
- 换签后必须：新 APK + 新 assetlinks 指纹

## 校验 assetlinks（App Links 可选）

```bash
curl -sI https://2sc.prestoai.cn/.well-known/assetlinks.json | head -5
```
