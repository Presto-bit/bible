# 双端验收清单（§24.5 · Flutter×H5）

> 用于 P5 稳态；执行人在真机/模拟器逐项勾选。

## 环境

- [ ] 官网 APK = Flutter（`biai-android.json` 中 `runtime: flutter`）
- [ ] `WEB_BASE_URL` 指向生产 H5（如 `https://2sc.prestoai.cn`）
- [ ] `API_BASE_URL` 指向生产 API
- [ ] 安装包 applicationId = `cn.prestoai.peiai`

## 账号与登录桥

- [ ] 原生登录成功后，打开发现仍是同一账号
- [ ] H5 内刷新/杀进程再进发现，未强制重新登录
- [ ] 换机：密码登录后原生+H5 均能拉进度

## 五 Tab 勿扰

- [ ] 圣经 Tab **无**消息红点/横幅
- [ ] 底栏「发现」**永不**未读角标
- [ ] 读经沉浸态可隐藏底栏

## H5 白名单

- [ ] 发现：会话列表 / 私信 / 群聊收发
- [ ] 建群、加好友走 H5
- [ ] 首页运营位 → 活动落地 H5
- [ ] 我的：阅读报告、协议与许可、提醒设置 H5
- [ ] 白名单外 path 在容器中提示或回落（不整站当浏览器）

## 读经 / 小爱跨容器

- [ ] 原生读经 → 半屏解释 → 「去问小爱」带锚点
- [ ] H5 内链到 `/assistant` 时可打开原生小爱（若导航被拦截）
- [ ] `window.__PEIAI_FLUTTER__.openNative({type:'open_assistant', ref})` 可用

## 深链 / 提醒

- [ ] `https://2sc.prestoai.cn/discover/...` App Link 进 H5 对应页
- [ ] `.../reader?book=&chapter=` 进读经
- [ ] 每日读经本地通知点击 → 进入读经（payload `/reader`）

## WebView SLA

- [ ] 输入框键盘不挡发送区（adjustResize）
- [ ] 弱网失败有诚实文案与重试
- [ ] 前后台切换后 session 仍在

## 埋点

- [ ] 原生 API 请求带 `X-Client-Kind: android_flutter`
- [ ] H5 会话 `peiai_client_kind=android_h5_tab`，analytics 可见

## 旧壳迁移

- [ ] 安装引导文案主推 Flutter 安装包，非 Chrome 依赖
- [ ] 旧 Chrome Host / WebView 壳用户：覆盖安装后可登录同一账号

## Shorebird（若已接入）

- [ ] patch **未**包含 IM/活动业务变更
- [ ] 紧急闪退 patch 可回滚
