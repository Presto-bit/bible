-- 活动运营：我的模板
CREATE TABLE IF NOT EXISTS ops_user_template (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_template_id TEXT NOT NULL,
  landing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_user_template_user_idx
  ON ops_user_template (user_id, updated_at DESC);
