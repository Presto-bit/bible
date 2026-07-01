-- 云优先用户数据表（IMPLEMENTATION-PLAN §7.3）。
-- 现有卷已初始化时不会自动重跑：手动 `psql -f` 或 `docker compose exec` 应用。

CREATE SEQUENCE IF NOT EXISTS user_data_seq;

-- id 主键 + version/deleted 的可变实体 ----------------------------------------
CREATE TABLE IF NOT EXISTS user_note (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  ref TEXT, body TEXT, tags TEXT[], is_private BOOLEAN DEFAULT false,
  version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS user_highlight (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  ref TEXT, color TEXT,
  version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS user_bookmark (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  ref TEXT,
  version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS memorize_card (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  ref TEXT, srs_state JSONB, due_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ai_session (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  anchor_ref TEXT, title TEXT,
  version INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);

-- 复合主键的单例/计数实体（无 version/deleted，整行 LWW）---------------------
CREATE TABLE IF NOT EXISTS reading_progress (
  user_id UUID NOT NULL, book TEXT, chapter INT, verse INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ,
  PRIMARY KEY (user_id)
);
CREATE TABLE IF NOT EXISTS reading_log (
  user_id UUID NOT NULL, date DATE NOT NULL, minutes INT, chapters INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS plan_progress (
  user_id UUID NOT NULL, plan_id TEXT NOT NULL, day INT, status TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ,
  PRIMARY KEY (user_id, plan_id)
);

CREATE TABLE IF NOT EXISTS user_profile (
  user_id UUID PRIMARY KEY, avatar_id TEXT, bio TEXT, username TEXT, user_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sync_cursor (
  user_id UUID NOT NULL, device_id TEXT NOT NULL, last_seq BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, device_id)
);

-- 增量游标索引（按 user_id + server_seq 拉取）
CREATE INDEX IF NOT EXISTS idx_user_note_seq ON user_note (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_user_highlight_seq ON user_highlight (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_user_bookmark_seq ON user_bookmark (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_memorize_card_seq ON memorize_card (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_ai_session_seq ON ai_session (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_reading_progress_seq ON reading_progress (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_reading_log_seq ON reading_log (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_plan_progress_seq ON plan_progress (user_id, server_seq);

-- 关联游客 AI 用量到用户（merge-guest 用）
ALTER TABLE ai_usage_daily ADD COLUMN IF NOT EXISTS user_id UUID;
