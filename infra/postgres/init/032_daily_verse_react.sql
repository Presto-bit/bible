-- 032：每日经文回应（仅白名单 emoji / 短语，每人每天一条）

CREATE TABLE IF NOT EXISTS daily_verse_react (
  verse_day INT NOT NULL,
  user_code TEXT NOT NULL,
  preset_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (verse_day, user_code)
);

CREATE INDEX IF NOT EXISTS daily_verse_react_day_created_idx
  ON daily_verse_react (verse_day, created_at DESC);

CREATE INDEX IF NOT EXISTS daily_verse_react_day_preset_idx
  ON daily_verse_react (verse_day, preset_id);
