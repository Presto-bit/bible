-- 每日 UV：按 visitor_key 去重（用户 UUID 或设备指纹），幂等写入。

CREATE TABLE IF NOT EXISTS daily_active_visitors (
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visitor_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visit_date, visitor_key)
);

CREATE INDEX IF NOT EXISTS daily_active_visitors_date_idx
  ON daily_active_visitors (visit_date);
