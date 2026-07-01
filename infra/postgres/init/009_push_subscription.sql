-- Web Push 订阅与提醒偏好（VAPID）
CREATE TABLE IF NOT EXISTS push_subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  reminder_enabled BOOLEAN NOT NULL DEFAULT false,
  reminder_hour SMALLINT,
  reminder_minute SMALLINT NOT NULL DEFAULT 0,
  streak_recall BOOLEAN NOT NULL DEFAULT false,
  group_digest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON push_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_push_sub_reminder ON push_subscription(reminder_enabled, reminder_hour, reminder_minute);
