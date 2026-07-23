-- 活动运营：全站受众 + Hero 挂载（仅平台超管可写）
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS audience_mode TEXT NOT NULL DEFAULT 'groups'
    CHECK (audience_mode IN ('groups', 'all', 'admin_preview'));
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_image_url_dark TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_image_version INT NOT NULL DEFAULT 1;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_alt TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_badge TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_href TEXT;

CREATE INDEX IF NOT EXISTS ops_campaign_hero_idx
  ON ops_campaign (hero_enabled, status, start_at, end_at, priority DESC)
  WHERE hero_enabled = TRUE;
