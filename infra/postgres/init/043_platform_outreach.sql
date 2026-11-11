-- 彼爱团队触达：欢迎信 / 全员信 / 用户反馈（与 social/outreach_schema.py 对齐）

CREATE TABLE IF NOT EXISTS platform_outreach_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'broadcast')),
  template_key TEXT,
  title TEXT,
  body TEXT NOT NULL,
  ref JSONB,
  audience TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'done', 'failed')),
  created_by TEXT,
  total_targets INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_outreach_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_key TEXT,
  job_id UUID REFERENCES platform_outreach_job(id) ON DELETE SET NULL,
  message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_outreach_delivery_user_template_uq
  ON platform_outreach_delivery (user_id, template_key)
  WHERE template_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_outreach_delivery_user_job_uq
  ON platform_outreach_delivery (user_id, job_id)
  WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  scene TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_feedback_created_idx ON user_feedback (created_at DESC);

ALTER TABLE direct_message DROP CONSTRAINT IF EXISTS direct_message_kind_chk;
ALTER TABLE direct_message
  ADD CONSTRAINT direct_message_kind_chk
  CHECK (kind IN ('chat', 'verse', 'image', 'file', 'video', 'audio', 'system', 'notice'));
