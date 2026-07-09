-- 阅读明细与成就解锁（P0/P1/P2 多端同步契约）

CREATE TABLE IF NOT EXISTS read_event (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  ts BIGINT NOT NULL,
  book TEXT NOT NULL,
  chapter INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS badge_unlock (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  badge_id TEXT NOT NULL,
  unlocked_at BIGINT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted BOOLEAN NOT NULL DEFAULT false,
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT, client_ts TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_read_event_seq ON read_event (user_id, server_seq);
CREATE INDEX IF NOT EXISTS idx_badge_unlock_seq ON badge_unlock (user_id, server_seq);
