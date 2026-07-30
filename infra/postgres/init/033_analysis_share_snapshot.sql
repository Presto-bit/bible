-- 小爱解读分享快照（跨设备落地）
CREATE TABLE IF NOT EXISTS analysis_share_snapshot (
  id TEXT PRIMARY KEY,
  ref_label TEXT NOT NULL DEFAULT '',
  ref_param TEXT NOT NULL DEFAULT '',
  lead TEXT NOT NULL DEFAULT '',
  answer_markdown TEXT NOT NULL DEFAULT '',
  citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  creator_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS analysis_share_snapshot_expires_idx
  ON analysis_share_snapshot (expires_at);
