-- 每日经文点赞 / 分享（按年内天序 verse_day 聚合）

CREATE TABLE IF NOT EXISTS daily_verse_like (
  verse_day INT NOT NULL,
  user_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (verse_day, user_code)
);
CREATE INDEX IF NOT EXISTS daily_verse_like_day_idx ON daily_verse_like (verse_day);

CREATE TABLE IF NOT EXISTS daily_verse_share (
  id BIGSERIAL PRIMARY KEY,
  verse_day INT NOT NULL,
  user_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_verse_share_day_idx ON daily_verse_share (verse_day);
