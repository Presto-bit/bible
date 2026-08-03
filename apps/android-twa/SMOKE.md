# Android 安卓安装包冒烟清单

部署 `2sc.prestoai.cn` 后按序勾选。

## 资源可达

- [ ] `https://2sc.prestoai.cn/downloads/biai-android.apk` 可下载
- [ ] `https://2sc.prestoai.cn/downloads/biai-android.json` 版本 ≥ **1.0.11 / versionCode 12**
- [ ] 壳内 `meta[name=app-version]` 与线上一致（壁纸/圣经点击/我的设置属 H5，不靠 APK 版本）
- [ ] `https://2sc.prestoai.cn/.well-known/assetlinks.json` 返回 JSON（App Links）
- [ ] UA 含 `PeiaiAndroidShell/… (vc…)`；`PeiaiShell.getVersionCode()` 与 meta 对齐

## 系统浏览器

- [ ] 安装引导主按钮「下载并安装」
- [ ] 允许未知来源后可完成安装
- [ ] 桌面图标「彼爱」打开后：**无地址栏、无其它浏览器标签**
- [ ] 冷启动为红底品牌开屏（窄门图标），进站后纸色首页、顶栏不贴状态栏
- [ ] 任务切换器中应用名为「彼爱」而非 Chrome
- [ ] 站内功能正常（读经 / 小爱 / 登录）
- [ ] 自动安装引导不再弹出
- [ ] 后台很久再回前台：首页滚动位置保留（不整页硬刷）

## 壳健康（1.0.8+）

- [ ] 故意装旧包或改 UA 测：有更新时约 1.6s 后出现可关半屏「下载更新」
- [ ] 外链打开后控制台/`PeiaiShell` 不可用；回本站后桥恢复
- [ ] 开启提醒后若未关电池优化，可出现「让读经提醒更准时」（可「稍后再说」）
- [ ] 通知小图标为白剪影（非彩色方块）
- [ ] 回前台后 H5 能吃到新 SW（或长后台后自动硬刷）

## 微信 / QQ

- [ ] 先逃逸到系统浏览器，再下载安装

## 仍出现地址栏？

1. 是否装的是 **1.0.1 以前的旧 TWA 包** → 卸载后重装官网当前 APK  
2. 是否从 **Chrome 书签 / 浏览器** 打开站点，而不是桌面「彼爱」图标  
3. 确认下载文件字节与 `biai-android.json` 的 `bytes` / `sha256` 一致
