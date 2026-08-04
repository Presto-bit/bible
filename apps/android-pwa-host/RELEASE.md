# Chrome Host 发版清单

1. 确认 `app/build.gradle.kts` 中 `versionName` / `versionCode` 已递增（仅容器或宿主变更时）
2. `./scripts/build_and_publish.sh`
3. 核对 `apps/web/public/.well-known/assetlinks.json` 指纹与 keystore SHA-256 一致
4. 部署 Web（含 APK、json、assetlinks）
5. 真机执行 [SMOKE.md](./SMOKE.md)
6. 旧 WebView 壳（1.x）用户应能覆盖安装；引导文案见 H5 `AndroidShellHealthGuide`

业务-only 发版：**不必**重建 APK。
