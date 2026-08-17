# 安卓 ↔ PWA 对齐 · 优先级与验收（执行清单）

> 依据：PRODUCT §5 / §23 / §24 · 目标：**事一致 + 感接近**（除 §24.4 系统差异）  
> 状态：工程已按下列项落地一轮；真机勾选见 [`android_dual_end_qa.md`](./android_dual_end_qa.md)

## 优先级

| 级 | 含义 |
|----|------|
| **P0** | 断主路径 / 账号锚点 / 发现壳 SLA |
| **P1** | 打开第一眼落差（首页 / 选中条 / 小爱输出 / 我的） |
| **P2** | 动效与边角打磨 |

## P0 已落地（本轮）

- [x] 半屏 → 小爱：种子线程（`assistant_seed.seedMessages`）+ 同日同锚点续用
- [x] 发现返回：先关 H5 半屏 → Web 历史 → Flutter；`go_back` 通道
- [x] 登出 / reinject：token 空时清 localStorage + `peiai-flutter-logout`
- [x] 深链：`/reader` `/assistant` `/discover` 同步 `navIndex`；发现子路径喂常驻 WebView
- [x] `open_assistant`：切 Tab + seed（避免叠路由）
- [x] 键盘：inset=0 时用宿主高度收缩识别 `im-keyboard`
- [x] 中国日界 + bootstrap 5min TTL + 弱网缓存回落
- [x] 小爱脚标上标可点 → 双语依据卡

## P1 已落地（本轮）

- [x] 首页 PTR toast / haptic；`planDoneToday`；欢迎回来按中国日
- [x] 选中条对齐 §5.2：**笔记 · 划线 · 复制 · 金句卡 · 对照 · 小爱**（安卓 / PWA 一致）
- [x] 我的同行主卡 → 优先 H5 `/report`
- [x] Web：`window.__PEIAI_DISMISS_OVERLAYS__` 供壳返回

## P1 / P2 本轮续做

- [x] Web / Flutter 选中条经典六键（笔记·划线·复制·金句卡·对照·小爱）；清理「更多 / 收藏 / 原文」主条实验代码
- [x] 首页分享文案对齐 + `shares_count` API 回写与展示
- [x] 小爱历史左滑「改名 / 删除」
- [x] Growth 抽 `home_growth_cards.dart` 与 Web 同序
- [x] 主题卡动态 `GET /content/themes`（`N 个主题 · 去搜索`）
- [x] 每日经文分享卡图（`daily_verse_share.dart` Overlay 截图）
- [x] PaperCard soft-edge / 24px 圆角 / home-shadow；同行主卡 tint 同构

## 仍可后续

| 项 | 说明 |
|----|------|
| FCM 服务端投递 | 客户端 FCM 已接入；服务端 `fcm_send.py` 支持 HTTP v1 / Legacy；需配置 `google-services.json` + `.env` 凭证 |
| Shorebird 发 IM 业务 | 禁止 |
| 原文 Strong's / 收藏 | 不在选中主条；另入口（设置或足迹） |
| 圣经 Chrome 定稿（2026-08-15） | 点按藏栏；沉浸藏尽 FAB；左右滑换章；译本封顶 2 |

## 真机最短验收

1. 读经选节 → 半屏解释 →「去问小爱」：**不重复提问**，历史里已有半屏问答  
2. 发现：开群设置半屏 → 系统返回先关半屏；再返回退会话  
3. 登录后发现 / 登出后再进：账号态一致  
4. 跨北京时间 0:00 回前台：首页经文换日  
5. 小爱回答脚标 `[n]` 可点开依据  
6. 选中条顺序：**笔记 · 划线 · 复制 · 金句卡 · 对照 · 小爱**；我的同行卡进报告为 H5（白名单）  
7. 设置：帮助中心 / 隐私 / 协议 走 H5；客服进发现 DM

## 发版轨提醒

- IM / 报告 / 协议 → `release: web`  
- 壳返回 / 桥 / 键盘 → `shorebird` 或随 full_apk  
- **禁止** Shorebird 发 IM 业务

## 关联

- [`android_dual_end_qa.md`](./android_dual_end_qa.md)  
- PRODUCT §24.5 / §24.6 / §5.2 / §5.3 / §5.5
