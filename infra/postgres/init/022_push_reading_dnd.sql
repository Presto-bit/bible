-- 022：推送订阅增加读经勿扰偏好（PRODUCT §23.7）
ALTER TABLE push_subscription
  ADD COLUMN IF NOT EXISTS reading_dnd BOOLEAN NOT NULL DEFAULT true;
