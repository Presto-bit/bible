# Android 安卓安装包冒烟清单

部署 `2sc.prestoai.cn` 后按序勾选。

## 资源可达

- [ ] `https://2sc.prestoai.cn/downloads/biai-android.apk` 可下载
- [ ] `https://2sc.prestoai.cn/downloads/biai-android.json` 版本 ≥ **1.0.2 / versionCode 3**
- [ ] `https://2sc.prestoai.cn/.well-known/assetlinks.json` 返回 JSON（App Links）

## 系统浏览器

- [ ] 安装引导主按钮「下载并安装」
- [ ] 允许未知来源后可完成安装
- [ ] 桌面图标「彼爱」打开后：**无地址栏、无其它浏览器标签**
- [ ] 任务切换器中应用名为「彼爱」而非 Chrome
- [ ] 站内功能正常（读经 / 小爱 / 登录）
- [ ] 自动安装引导不再弹出

## 微信 / QQ

- [ ] 先逃逸到系统浏览器，再下载安装

## 仍出现地址栏？

1. 是否装的是 **1.0.1 以前的旧 TWA 包** → 卸载后重装官网当前 APK  
2. 是否从 **Chrome 书签 / 浏览器** 打开站点，而不是桌面「彼爱」图标  
3. 确认下载文件字节与 `biai-android.json` 的 `bytes` / `sha256` 一致
