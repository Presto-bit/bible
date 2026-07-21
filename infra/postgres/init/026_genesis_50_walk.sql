-- 026：创世记 50 次同行（专题进度 / 打卡 / 回应 / 评论）
CREATE TABLE IF NOT EXISTS series_participation (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  series_id TEXT NOT NULL,
  last_day INT NOT NULL DEFAULT 7,
  last_tab TEXT NOT NULL DEFAULT 'scripture',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, series_id)
);
CREATE INDEX IF NOT EXISTS series_participation_series_idx
  ON series_participation (series_id, opened_at);

CREATE TABLE IF NOT EXISTS session_checkin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id TEXT NOT NULL,
  day INT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (series_id, day, user_id)
);
CREATE INDEX IF NOT EXISTS session_checkin_series_day_idx
  ON session_checkin (series_id, day, created_at DESC);
CREATE INDEX IF NOT EXISTS session_checkin_user_idx
  ON session_checkin (user_id, series_id);

CREATE TABLE IF NOT EXISTS checkin_reaction (
  checkin_id UUID NOT NULL REFERENCES session_checkin(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (checkin_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS checkin_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id UUID NOT NULL REFERENCES session_checkin(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkin_comment_checkin_idx
  ON checkin_comment (checkin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS checkin_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, reporter_id)
);
