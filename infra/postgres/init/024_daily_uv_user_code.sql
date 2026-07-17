-- UV：落库请求头中的 8 位 user_code，明细可直接展示（不依赖 accounts 建档完成）

ALTER TABLE daily_active_visitors
  ADD COLUMN IF NOT EXISTS user_code TEXT;

CREATE INDEX IF NOT EXISTS daily_active_visitors_user_code_idx
  ON daily_active_visitors (visit_date, user_code)
  WHERE user_code IS NOT NULL;
