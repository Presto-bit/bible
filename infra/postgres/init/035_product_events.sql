-- 产品功能事件（P0 打点：功能使用排行 / 激活漏斗）

CREATE TABLE IF NOT EXISTS product_events (
  id BIGSERIAL PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_code TEXT,
  device_id TEXT,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  path TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_name_created_idx
  ON product_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS product_events_user_created_idx
  ON product_events (user_code, created_at DESC)
  WHERE user_code IS NOT NULL AND trim(user_code) <> '';

CREATE INDEX IF NOT EXISTS product_events_created_idx
  ON product_events (created_at DESC);

CREATE INDEX IF NOT EXISTS product_events_day_name_idx
  ON product_events (
    (timezone('Asia/Shanghai', created_at))::date,
    event_name
  );
