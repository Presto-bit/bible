-- 全员信异步队列（在 043 之后执行）

ALTER TABLE platform_outreach_job
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0;
ALTER TABLE platform_outreach_job
  ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0;

ALTER TABLE platform_outreach_job DROP CONSTRAINT IF EXISTS platform_outreach_job_status_check;
ALTER TABLE platform_outreach_job
  ADD CONSTRAINT platform_outreach_job_status_check
  CHECK (status IN ('draft', 'queued', 'sending', 'done', 'failed'));

CREATE TABLE IF NOT EXISTS platform_outreach_queue (
  job_id UUID NOT NULL REFERENCES platform_outreach_job(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  done_at TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS platform_outreach_queue_pending_idx
  ON platform_outreach_queue (job_id)
  WHERE done_at IS NULL;
