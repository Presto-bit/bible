# Android TWA 直装冒烟清单

部署 `2sc.prestoai.cn` 后按序勾选。

## 资源可达

- [ ] `https://2sc.prestoai.cn/.well-known/assetlinks.json` 返回 JSON，含 `cn.prestoai.peiai` 与证书 SHA-256
- [ ] `https://2sc.prestoai.cn/downloads/peiai-android.apk` 可下载
- [ ] `https://2sc.prestoai.cn/downloads/peiai-android.json` 版本信息正确
- [ ] [Digital Asset Links 生成器](https://developers.google.com/digital-asset-links/tools/generator) 对主机 `2sc.prestoai.cn` + 包名校验通过

## 系统浏览器（Chrome / 厂商浏览器）

- [ ] 打开安装引导，标题为「安装彼爱」，主按钮为「下载并安装」
- [ ] 点击后开始下载 APK（不跳应用商店）
- [ ] 允许未知来源后可完成安装
- [ ] 桌面图标「彼爱」打开后**无地址栏**（TWA 全屏）
- [ ] 进入站点功能正常（读经 / 小爱 / 登录）

## 微信 / QQ 内置浏览器

- [ ] 主按钮为「复制链接，用浏览器打开再安装」
- [ ] 用系统浏览器打开后可下载安装

## 装前同步

- [ ] 已登录用户点击下载前会出现「正在保存读经记录…」
- [ ] 重装后同账号可恢复进度（与既有同步一致）

## 仍看到浏览器地址栏？

Google 已能校验本站 `assetlinks`（`linked: true`）。若安装后仍有地址栏，通常不是站点未配置，而是：

1. **从浏览器打开了链接**，而不是点桌面「彼爱」图标  
2. **在 assetlinks 上线之前装的旧包**：请卸载后重新下载安装  
3. **应用链接未验证**：系统设置 → 应用 → 彼爱 → 打开方式 / 支持的链接 → 确认 `2sc.prestoai.cn` 为「始终允许」  
4. 用 Chrome 打开：`chrome://install-errors` 或开发者选项里查看 App Links 校验状态  

验证命令（电脑）：

```bash
curl -s "https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://2sc.prestoai.cn&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=cn.prestoai.peiai&target.android_app.certificate.sha256_fingerprint=80:E7:34:E1:36:8A:D0:26:D4:19:84:48:75:AD:8F:C7:9B:F6:48:1F:82:5A:02:6E:D3:44:9A:95:07:FE:72:16"
```

应返回 `"linked": true`。
