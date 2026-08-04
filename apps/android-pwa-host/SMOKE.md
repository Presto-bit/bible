# Chrome Host 冒烟（对齐 iOS PWA）

## 安装与关联

- [ ] 官网下载 `biai-android.apk` 可安装（同签名覆盖 1.x）
- [ ] `https://2sc.prestoai.cn/.well-known/assetlinks.json` 返回正确指纹
- [ ] 冷启动：红底开屏 → 进站 **无地址栏**、无 WebView 控件
- [ ] 无 Chrome 时进入「需要 Chrome」页（不回落 WebView）

## 体验对齐

- [ ] 读经半屏 / 发现会话：无「点了闪关 / 无响应」
- [ ] 竖屏、safe-area、底栏与 iOS standalone 观感一致
- [ ] 杀进程重开：业务为最新（Chrome / SW，无需清 WebView 缓存）
- [ ] 深链 `https://2sc.prestoai.cn/reader` 打开对应页；返回键符合 SPA

## 能力宿主

- [ ] 开启每日读经提醒 → 到点本地通知 → 点击回站
- [ ] 通知权限 / 电池优化引导可打开系统页
- [ ] 半屏「有新的安装包」→ 可下载并覆盖安装

## 负面

- [ ] 未校验 assetlinks 时会出现地址栏 → 视为发版失败，修指纹后重测
- [ ] 旧 WebView 壳用户打开站内应看到升级引导
