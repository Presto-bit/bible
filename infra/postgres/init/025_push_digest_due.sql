-- 近实时消息聚合：按用户排队，due_at 为合并推送时刻（trailing debounce）
CREATE TABLE IF NOT EXISTS push_digest_due (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_digest_due_at ON push_digest_due (due_at);
