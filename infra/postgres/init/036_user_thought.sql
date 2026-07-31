-- 经文想法云同步（对齐 user_note 形态；点赞不同步）

CREATE TABLE IF NOT EXISTS user_thought (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  ref TEXT,
  body TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at_ms BIGINT,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT,
  client_ts TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_thought_user_seq
  ON user_thought (user_id, server_seq);
