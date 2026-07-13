-- 020：群任务 v2（类型、完成规则、附件、指派、系列/定时、计划来源）
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS completion_rule TEXT NOT NULL DEFAULT 'checkin_text';
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS series_id UUID;
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS series_day INT;
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE group_task ADD COLUMN IF NOT EXISTS plan_day INT;

CREATE INDEX IF NOT EXISTS group_task_status_publish_idx
  ON group_task (group_id, status, publish_at);
CREATE INDEX IF NOT EXISTS group_task_due_reminder_idx
  ON group_task (group_id, due_at)
  WHERE reminder_sent_at IS NULL AND due_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS group_task_plan_day_uq
  ON group_task (group_id, plan_id, plan_day)
  WHERE source = 'plan_day' AND plan_id IS NOT NULL AND plan_day IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_task_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'custom',
  completion_rule TEXT NOT NULL DEFAULT 'checkin_text',
  total_days INT NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_task_series_group_idx ON group_task_series (group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_task_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES group_task(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_task_attachment_task_idx ON group_task_attachment (task_id);

CREATE TABLE IF NOT EXISTS group_task_assignee (
  task_id UUID NOT NULL REFERENCES group_task(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_task_assignee_user_idx ON group_task_assignee (user_id);
