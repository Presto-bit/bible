-- 首页 Hero B 运营活动位
CREATE TABLE IF NOT EXISTS hero_b_campaign (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  priority INT NOT NULL DEFAULT 0,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  image_url TEXT NOT NULL,
  image_url_dark TEXT,
  image_version INT NOT NULL DEFAULT 1,
  alt TEXT NOT NULL,
  badge TEXT,
  link_json JSONB NOT NULL,
  href TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'admin_preview')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hero_b_campaign_schedule
  ON hero_b_campaign (enabled, status, start_at, end_at, priority DESC);
