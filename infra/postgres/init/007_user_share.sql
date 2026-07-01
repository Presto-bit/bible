-- 007：用户分享动态（经文想法/笔记，供好友动态流）
CREATE TABLE IF NOT EXISTS user_share (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'thought',
  ref TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_share_user_idx ON user_share (user_id, created_at DESC);
