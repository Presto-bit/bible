-- 管理后台运行时开关（JSON），如每日经文暖场

CREATE TABLE IF NOT EXISTS admin_runtime_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
