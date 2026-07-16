-- 私信消息表情回应（与 group_message.reactions 对齐）
ALTER TABLE direct_message
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '{}'::jsonb;
