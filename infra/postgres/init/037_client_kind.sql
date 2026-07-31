-- 首次触达客户端（PWA / 浏览器 / 内置浏览器 / 原生）

ALTER TABLE daily_active_visitors
  ADD COLUMN IF NOT EXISTS client_kind TEXT;

CREATE INDEX IF NOT EXISTS daily_active_visitors_client_kind_idx
  ON daily_active_visitors (visit_date, client_kind)
  WHERE client_kind IS NOT NULL AND trim(client_kind) <> '';

ALTER TABLE user_acquisition
  ADD COLUMN IF NOT EXISTS client_kind TEXT;

CREATE INDEX IF NOT EXISTS user_acquisition_client_kind_idx
  ON user_acquisition (client_kind, bound_at DESC)
  WHERE client_kind IS NOT NULL AND trim(client_kind) <> '';
