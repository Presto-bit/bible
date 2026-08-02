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

## 降级

- [ ] 「仅添加浏览器快捷方式」仅在 Chrome 有 beforeinstallprompt 时出现，为次要入口
