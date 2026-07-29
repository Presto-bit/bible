-- 获客三级渠道（First Touch，一用户一行，永不覆盖）

CREATE TABLE IF NOT EXISTS user_acquisition (
  user_code TEXT PRIMARY KEY,
  channel_l1 TEXT NOT NULL
    CHECK (channel_l1 IN ('organic', 'share', 'campaign', 'social', 'ads', 'unknown')),
  channel_l2 TEXT NOT NULL DEFAULT '',
  channel_l3 TEXT NOT NULL DEFAULT '',
  raw_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  landing_path TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  device_id TEXT,
  captured_at TIMESTAMPTZ,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_acquisition_l1_idx
  ON user_acquisition (channel_l1, bound_at DESC);

CREATE INDEX IF NOT EXISTS user_acquisition_l2_idx
  ON user_acquisition (channel_l2, bound_at DESC)
  WHERE channel_l2 <> '';
