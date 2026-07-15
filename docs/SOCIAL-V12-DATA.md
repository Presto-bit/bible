# 社交 v1.2 数据设计方案

> 对应 PRODUCT §23 · `021_social_im_v12.sql`  
> 原则：兼容既有 `social_group` / `group_message` / `friendship`；新能力用新表扩展；**消息 30 天物理删除**；**处置证据单独留存**。

---

## 1. 实体关系（概念）

```
users
  ├── friendship（已通过关系，对称两行，不变）
  ├── friend_request（申请制）
  ├── group_member（role: owner|admin|member）
  ├── conversation_state（未读/置顶/免打扰）
  ├── direct_thread ── direct_message ── message_attachment
  └── moderation_case ── moderation_snapshot

social_group（+ allow_chat）
  ├── group_member
  ├── group_message（kind 扩展 + reply_to + recalled_at）
  │     └── message_attachment（群/单聊共用，scope 区分）
  └── group_task / plan 绑定（不随 30 天消息删除）
```

---

## 2. 表设计

### 2.1 扩展既有表

| 表.列 | 类型 | 说明 |
|-------|------|------|
| `social_group.allow_chat` | BOOLEAN NOT NULL DEFAULT true | 群闲聊开关，仅 owner 可改 |
| `group_member.role` | TEXT | 约束 `'owner'\|'admin'\|'member'`（CHECK） |
| `group_message.kind` | TEXT | 扩展见下；旧 `checkin/task/system` 保留 |
| `group_message.reply_to_id` | UUID NULL → group_message | 引用回复 |
| `group_message.recalled_at` | TIMESTAMPTZ NULL | 撤回时间；body 可置空或占位 |
| `group_message.mentions` | JSONB DEFAULT '[]' | user_id 列表；含特殊 `"all"` |

**group_message.kind：**  
`checkin | task | system | chat | plan | verse | image | file`

### 2.2 `friend_request`

| 列 | 说明 |
|----|------|
| id UUID PK | |
| from_user_id, to_user_id | FK users |
| message TEXT | 验证信息 ≤120，过审 |
| status | `pending\|accepted\|declined\|cancelled` |
| created_at, resolved_at | |

**唯一：** 同一对用户仅一条 `pending`（部分唯一索引）。  
**流转：** accept → 写对称 `friendship` + status=accepted。

### 2.3 单聊

**`direct_thread`**

| 列 | 说明 |
|----|------|
| id UUID PK | |
| user_low_id, user_high_id | 规范化 user_a < user_b（字典序 UUID 文本） |
| created_at | |
| UNIQUE(user_low_id, user_high_id) | |

**`direct_message`**

| 列 | 说明 |
|----|------|
| id UUID PK | |
| thread_id FK | |
| sender_id FK | |
| kind | `chat\|verse\|image\|file\|system` |
| body, ref | 经文卡用 ref |
| reply_to_id | 自引用 |
| recalled_at | |
| created_at | 索引 (thread_id, created_at DESC) |

### 2.4 `message_attachment`

| 列 | 说明 |
|----|------|
| id UUID PK | |
| scope | `group\|dm` |
| message_id | 对应 group_message.id 或 direct_message.id |
| storage_key | 对象存储路径 |
| file_name, mime, size_bytes | |
| created_at | |

**白名单 mime/后缀：** pdf, doc, docx, xls, xlsx, ppt, pptx + 常见 image/*。  
清理任务按 message 过期删行 + 删对象。

### 2.5 `conversation_state`

| 列 | 说明 |
|----|------|
| user_id | |
| scope | `group\|dm\|inbox_friends\|inbox_groups` |
| ref_id | group_id / thread_id / 固定 inbox id |
| last_read_at | 未读 = 对方消息 created_at > last_read_at |
| pinned_at | NULL=未置顶 |
| muted | BOOLEAN DEFAULT false |
| PRIMARY KEY (user_id, scope, ref_id) | |

### 2.6 审核与证据

**`moderation_case`：** id, reporter_id, target_type(`group_message|dm|group|user`), target_id, reason(`spam|abuse|heresy|illegal|other`), status(`open|actioned|dismissed`), created_at, resolved_at, resolution_note  

**`moderation_snapshot`：** case_id, payload JSONB（消息全文、发送者、群名等），created_at —— **不受 30 天消息删除影响**。

### 2.7 配置（可选表或文件）

`content_blocklist(kind, pattern, note)` — kind=`word|domain|heresy`；启动加载缓存。MVP 可用 JSON 配置 + DB 后续。

---

## 3. 未读计算

- **群：** `max(group_message.created_at) filter not recalled` > `conversation_state.last_read_at`（缺省当作 epoch）且 message.user_id ≠ me → 计未读条数或「有未读」  
- **DM：** 同理  
- **inbox_friends：** pending `friend_request` where to_user=me → 未读会话行  
- **角标：** 底栏发现 **不读** 未读数；仅列表内展示  

---

## 4. 30 天清理策略

```
每日任务：
  1. DELETE group_message WHERE created_at < now() - 30 days
     AND id NOT IN (仍 open 的 case 所引用且 snapshot 未写完的 — 优先保证先写 snapshot)
  2. DELETE direct_message 同上
  3. DELETE message_attachment 孤儿 + 删存储
  4. 不删：friendship, friend_request(可另定 90 天归档), group_*, group_task*, moderation_*
```

应用层拉消息一律 `WHERE created_at >= now() - interval '30 days' AND recalled_at IS NULL`（撤回消息可保留行显示占位，也计入 30 天）。

---

## 5. 权限矩阵（数据层可表达）

| 动作 | owner | admin | member |
|------|--------|-------|--------|
| INSERT chat（allow_chat） | Y | Y | Y |
| INSERT checkin | Y | Y | Y |
| INSERT task / plan 类 | Y | Y | N |
| UPDATE allow_chat / 设 admin | Y | N | N |
| DELETE 任意消息 | Y | Y | 仅自己 |
| 踢 member | Y | Y | N |
| 踢 admin | Y | N | N |

---

## 6. 索引清单（关键）

- `group_message (group_id, created_at DESC)` 已有，保留  
- `group_message (created_at)` — 清理扫描  
- `direct_message (thread_id, created_at DESC)`  
- `direct_message (created_at)` — 清理  
- `friend_request (to_user_id, status)`  
- `conversation_state (user_id)`  
- `message_attachment (scope, message_id)`  

---

## 7. 迁移与回滚

- 文件：`infra/postgres/init/021_social_im_v12.sql`（幂等 IF NOT EXISTS）  
- 回滚：DROP 新表；DROP 新列（生产慎用）；role 约束放宽  

---

## 8. 与旧数据兼容

- 既有 friendship 保留，不强制补 request  
- 既有 group_message 无 reply/recalled 时为 NULL  
- role 非 admin 的存量仅为 owner/member  
- `user_share` / friends activity：**停写、UI 下线**；表可保留不强制 DROP  
