-- 群定向活动运营（CAMPAIGN-OPS MVP）
CREATE TABLE IF NOT EXISTS ops_campaign (
  id TEXT PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'ended', 'disabled')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  cover_url TEXT,
  subtitle TEXT NOT NULL DEFAULT '',
  rail_slot INT NOT NULL DEFAULT 1 CHECK (rail_slot BETWEEN 1 AND 3),
  rail_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 50,
  landing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_campaign_creator_idx
  ON ops_campaign (creator_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ops_campaign_schedule_idx
  ON ops_campaign (status, rail_enabled, start_at, end_at, rail_slot, priority DESC);

CREATE TABLE IF NOT EXISTS ops_campaign_audience (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, group_id)
);

CREATE INDEX IF NOT EXISTS ops_campaign_audience_group_idx
  ON ops_campaign_audience (group_id);

CREATE TABLE IF NOT EXISTS ops_campaign_like (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS ops_campaign_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  day INT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_campaign_comment_idx
  ON ops_campaign_comment (campaign_id, day, created_at DESC);

CREATE TABLE IF NOT EXISTS ops_campaign_rsvp (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('yes', 'no', 'maybe')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS ops_campaign_day_read (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id, day)
);

CREATE TABLE IF NOT EXISTS ops_campaign_open (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS ops_campaign_prayer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_campaign_prayer_idx
  ON ops_campaign_prayer (campaign_id, created_at DESC);
