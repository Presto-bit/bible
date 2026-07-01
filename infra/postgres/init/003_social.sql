-- 003：用户资料扩展 + 社交（群/成员/消息流/好友）
-- 群仅支持「打卡 / 任务」消息（不支持自由聊天，见 PRODUCT 群功能）。

-- 用户资料扩展（dev-login 需要 handle/display_name）
ALTER TABLE users ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_handle_uq ON users (handle) WHERE handle IS NOT NULL;

-- 群
CREATE TABLE IF NOT EXISTS social_group (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  intro TEXT,
  owner_id UUID NOT NULL REFERENCES users(id),
  join_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 群成员
CREATE TABLE IF NOT EXISTS group_member (
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',   -- owner / member
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_member_user_idx ON group_member (user_id);

-- 群消息流（仅打卡/任务，不支持自由聊天）
CREATE TABLE IF NOT EXISTS group_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,                     -- checkin / task
  ref TEXT,                               -- 关联经文（打卡须挂经文或任务）
  task_id UUID,                           -- 关联任务（可空）
  body TEXT,
  reactions JSONB NOT NULL DEFAULT '{}',  -- {emoji: [user_id,...]}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_message_group_idx ON group_message (group_id, created_at);

-- 群任务（群主发布，成员完成后可一键打卡）
CREATE TABLE IF NOT EXISTS group_task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  ref TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_task_group_idx ON group_task (group_id, created_at);

-- 好友（无私聊；仅关系与分享对象）。对称存两行，便于查询。
CREATE TABLE IF NOT EXISTS friendship (
  user_id UUID NOT NULL REFERENCES users(id),
  friend_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);
