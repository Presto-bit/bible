-- UV V2：设备为主键、user_id 附加；统计按 COALESCE(user_id, device) 去重。

ALTER TABLE daily_active_visitors
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS user_bound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 从旧 visitor_key 回填
UPDATE daily_active_visitors
SET
  device_fingerprint = CASE
    WHEN visitor_key LIKE 'd:%' THEN substring(visitor_key FROM 3)
    WHEN visitor_key LIKE 'u:%' THEN 'legacy-u:' || substring(visitor_key FROM 3)
    ELSE visitor_key
  END,
  user_id = CASE
    WHEN visitor_key LIKE 'u:%'
      AND substring(visitor_key FROM 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN substring(visitor_key FROM 3)::uuid
    ELSE user_id
  END,
  user_bound_at = CASE
    WHEN visitor_key LIKE 'u:%' THEN created_at
    ELSE user_bound_at
  END
WHERE device_fingerprint IS NULL;

ALTER TABLE daily_active_visitors
  ALTER COLUMN device_fingerprint SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS daily_active_visitors_date_device_uq
  ON daily_active_visitors (visit_date, device_fingerprint);

CREATE INDEX IF NOT EXISTS daily_active_visitors_user_date_idx
  ON daily_active_visitors (visit_date, user_id)
  WHERE user_id IS NOT NULL;
