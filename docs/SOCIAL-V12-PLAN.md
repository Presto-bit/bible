# 社交 v1.2 全量实施计划（PRODUCT §23）

> 依据：`PRODUCT.md` §23（含顶区约束：无问候行、无横滑卡轨、无「今日共读」顶条）  
> 完成度：**成熟期全量交付**（分批上线，每批达正式质量）  
> 平台优先：**Web（`apps/web`）+ API** 先齐；**Mobile** 同规格跟版  
> 日期：2026-07-15

---

## 实施进度（2026-07-15 开干）

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| 数据设计 | ✅ | `docs/SOCIAL-V12-DATA.md` + `021_social_im_v12.sql` |
| S0 | ✅ 部分 | 迁移就绪；Discover 双 Tab 壳；去今日共读/动态/横滑 |
| S1 | ✅ | `/social/conversations` + Web 消息列表 |
| S2 | ✅ 骨架 | 申请制 API+UI；DM 收发页 |
| S3 | ✅ 骨架 | `/chat`、allow_chat、admins；Composer 闲聊；任务权到 admin |
| S4 | ✅ Web 主路径 | 置顶/免打扰/搜索/图文件/@/引用回复/撤回/复制/回底/群筛选 已接 |
| S5 | ✅ | retention+审核台+30 天文案；读经勿扰/聚合推送已产品化；底栏无角标 |
| S6 | ✅ PWA（Flutter 暂缓） | SSE/推送/KeepAlive；会话 chip/左滑；吸顶共读；好友搜索；闲聊开关/设管；UI 抛光；SW v19 |
| S7 | ⏳ | §23.11 回归验收；埋点/DEPLOY 可选 |

**上线前必做：** 在生产 PG 执行 `021_social_im_v12.sql`，重启 API。

---

## 0. 范围总表（必须全部完成）

| 域 | 交付物 |
|----|--------|
| 发现 IA | 消息 / 好友双 Tab；右上建群 / 加好友；底栏发现无角标；无好友动态；无顶区问候/横滑/今日共读 |
| 好友 | 申请制；同意后好友；新的朋友 inbox |
| 单聊 | 文字/图/经文卡；成熟 IM 能力 |
| 群 | 闲聊默认开；主/管；打卡/任务/群计划/图/PDF·Office；共读条仅在**群会话内**；全员发图文件（无开关） |
| IM | 列表置顶/免打扰/搜索/摘要；撤回/引用/@；发送态；媒体进度；筛选 |
| 生命周期 | 群+单聊消息及附件 30 天物理删除 |
| 通知 | 圣经 Tab 勿扰；底栏无角标；推送可静音聚合 |
| 安全 | 通审+异端词库；举报含异端；审核台；处置档案；主/管治理 |
| 清理旧能力 | 下线好友动态 UI/API 主路径 |

---

## 1. 现状 → 缺口

| 已有（可复用） | 缺口（本计划新建/改造） |
|----------------|-------------------------|
| 群 CRUD、邀请、打卡挂经文、任务 v2、emoji、举报雏形 | `chat` / 单聊 / 申请制 / admin 角色 |
| `group_message`、Web 群页 Composer | 统一会话列表、未读、置顶、免打扰 |
| `moderation.py` 关键词 MVP | 扩 IM + 词库配置 + 审核台 + 异端类型 |
| 好友对称 `friendship` 即加 | 改为申请表 + inbox |
| `user_share` 动态 | **产品删除**：UI 下线 |
| 无私聊表 | `direct_thread` / `direct_message` |
| 无实时 | WS/SSE + 离线补拉 |
| 无 30 天清理 | cron + 对象存储删除 |

---

## 2. 里程碑总览

| 里程碑 | 周期（估） | 目标 | 质量门禁 |
|--------|------------|------|----------|
| **S0 地基** | 3–5 天 | Schema + 权限模型 + 发现双 Tab 壳 | 迁移可回滚；Web 壳可点 |
| **S1 会话列表** | 1–1.5 周 | 消息列表（群摘要）+ 好友列表；去动态/去顶条 | 列表 e2e；底栏无角标 |
| **S2 申请制 + 单聊骨架** | 1.5–2 周 | 好友申请；1:1 文字+经文卡 | 申请态机单测；单聊收发 |
| **S3 群 IM + 角色** | 2 周 | chat 默认开；admin；Composer 全能力；群内共读条 | 权限矩阵全绿 |
| **S4 媒体 + IM 深化** | 1.5–2 周 | 图/文件；撤回/引用/@；搜索/置顶/免打扰/筛选 | IM 回归表 |
| **S5 清理/通知/安全** | 1.5–2 周 | 30 天任务；勿扰；审核台与异端工单 | 清理演练；勿扰验收 |
| **S6 实时 + Mobile 对齐** | 2 周 | WS/推拉；Flutter 对齐 Web | 双端冒烟 |
| **S7 打磨验收** | 1 周 | 性能/文案/埋点/协议 | §23.11 验收清单勾满 |

*合计约 9–12 人周（1 全栈）；2 人可压缩到约 6–8 周。*

---

## 3. 分里程碑任务拆解

### S0 — 地基（Schema + 壳）

**DB（新迁移建议 `021_social_im_v12.sql` 起）：**

- [ ] `group_member.role` 扩展：`owner | admin | member`
- [ ] `group_message.kind` 扩展：`chat | checkin | task | plan | verse | image | file | system`
- [ ] `social_group.allow_chat` BOOLEAN DEFAULT true
- [ ] `friend_request`（from/to/status/message/created_at）
- [ ] 停用「即加成」写路径（兼容迁移旧 friendship）
- [ ] `direct_thread` + `direct_message`
- [ ] `conversation_state`（last_read / pinned / muted）
- [ ] `message_attachment`
- [ ] `moderation_case` / `moderation_snapshot`
- [ ] 异端词库/域名黑名单配置位（env 或表）

**API / Web：**

- [ ] 权限助手：`require_group_role`
- [ ] `DiscoverTab`：消息|好友；右上＋分流
- [ ] **删除**：今日共读条、好友动态区块、发现页横滑群卡、发现问候行
- [ ] 底栏发现角标关闭确认

**验收：** 发现仅双 Tab + 列表占位；三禁项不可见。

---

### S1 — 会话列表

- [ ] `GET /social/conversations`
- [x] 群行：类型化摘要、未读、弱 chip（待打卡/任务）
- [x] Web Tier1 列表；进群
- [x] 好友 Tab：列表/搜索/空态
- [x] 下线动态主路径

**验收：** 有群可见会话；无动态/无今日共读/无横滑。

---

### S2 — 申请制 + 单聊

- [ ] 好友申请 API 与 UI；「新的朋友」inbox 行
- [ ] 同意后 friendship；DM 文字 + 经文卡
- [ ] 会话列表并入 DM
- [ ] 无通话入口

**验收：** 申请→同意→互发文字/经文卡。

---

### S3 — 群闲聊 + 管理员 + Composer

- [x] `chat`；`allow_chat`（仅 owner）
- [x] admin 设撤；任务/计划权限
- [ ] 成员分享个人计划 403；Composer 无入口
- [x] 群内吸顶共读条；筛选（全部/打卡任务/文件）
- [x] system：设管等

**验收：** 权限矩阵全绿。

---

### S4 — 媒体 + IM 深化

- [x] 图/PDF·Office 上传与气泡（群+私信 Web）
- [x] @ 成员 chips + 正文前缀；撤回 API + 气泡「撤回」（2 分钟 / staff）
- [x] 置顶、免打扰、搜索（发现消息 Tab）
- [x] 引用回复（群+私信）；发送中/失败态（乐观消息）
- [x] 长按复制；回到底部分离按钮
- [ ] 单聊弱已读/输入中（可选规格内）；群无已读到人

**验收：** IM 回归表全过。

---

### S5 — 30 天 / 通知 / 安全

- [x] 定时物理删除消息+附件行+磁盘（`POST /social/retention/run` + cron 脚本；任务实体保留）
- [x] 30 天文案（发现/群/私信/建群）
- [x] 底栏无角标（既有）；圣经 Tab 零消息提示（底栏无 badge）
- [x] 推送 mute/聚合；读经勿扰设置（我的→推送提醒）；摘要尊重会话免打扰
- [x] 审核覆盖 chat/DM；异端词库；举报 heresy UI；Admin 审核台；建群信仰须知
- [x] 工单快照写群+DM 正文（独立表，不受 30 天删除）

**验收：** 清理演练 + 勿扰 + L1 工单通路。

---

### S6 — 实时 + Mobile

- [x] PWA：`/social/realtime/sse` + 客户端智能刷新（发现/群/私信）
- [x] PWA：推送深链、前台 Notification data.href、`/reader` 读经勿扰、复制、回到底部
- [x] PWA：TabKeepAlive 注册 dm/invites；加好友申请制；下线动态入口；经文卡→私信
- [x] PWA：会话待打卡 chip、吸顶共读条、好友搜索/资料、群邀请页、闲聊开关/设管、死代码+SW v18
- [ ] Flutter（本阶段暂缓）
- [ ] 真正 WebSocket 双向通道（可选，SSE 已等价补拉）

**验收：** 双标签互发数秒内刷新；点推送进正确会话。

---

### S7 — 打磨

- [ ] §23.11 全勾；性能；埋点；删死代码；ARCHITECTURE/DEPLOY 更新

---

## 4. 表与 API 摘要

**表：** `friend_request` · `direct_thread`/`direct_message` · `message_attachment` · `conversation_state` · `moderation_*`；扩展 `group_member.role` · `group_message.kind` · `social_group.allow_chat`。

**API：** `/social/conversations` · `friend-requests*` · `dm/*` · 群 messages 扩 kind · admins · recall · uploads · search · conversation state · reports · `/admin/moderation/*` · WS。

**Web 落点：** `DiscoverTab.tsx` · 新 `ConversationList` · 新 `dm/[id]` · `group/*` · `lib/api.ts` · `BottomTabs`。

---

## 5. 第一周开工顺序

1. Day 1–2：迁移 `021` + 权限 helper + Discover 双 Tab 壳（撕动态/今日共读/横滑）  
2. Day 3–4：conversations API + Web 列表  
3. Day 5–7：friend_request + 加好友流  

其后按 S2→S7；每里程碑对照 §0 勾选。

---

## 6. 完成定义（DoD）

- PRODUCT §23.11 全部满足；本文件 §0 全部勾选  
- Web 主路径完整；Mobile 差量为 0  
- 代码中不存在：好友动态入口、发现问候行、发现横滑卡轨、消息顶「今日共读」  
