-- 活动运营 V1.2：名额报名 + 提问箱
CREATE TABLE IF NOT EXISTS ops_campaign_signup (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, slot_id, user_id)
);
CREATE INDEX IF NOT EXISTS ops_campaign_signup_slot_idx
  ON ops_campaign_signup (campaign_id, slot_id);

CREATE TABLE IF NOT EXISTS ops_campaign_question (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ops_campaign_question_idx
  ON ops_campaign_question (campaign_id, created_at DESC);
