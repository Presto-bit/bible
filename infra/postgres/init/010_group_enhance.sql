-- 010：群增强（置顶任务、系统消息 kind 已用 TEXT 无需改表约束）
ALTER TABLE social_group ADD COLUMN IF NOT EXISTS pinned_task_id UUID REFERENCES group_task(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_group_message_system ON group_message (group_id, created_at)
  WHERE kind = 'system';
