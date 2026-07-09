-- AI 请求明细日志（管理后台 scene/成功率/时段分析）

CREATE TABLE IF NOT EXISTS ai_request_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  guest_id UUID REFERENCES guest_devices(guest_id),
  scene TEXT,
  mode TEXT,
  surface TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_request_log_created ON ai_request_log (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_scene ON ai_request_log (scene, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_request_log_status ON ai_request_log (status, created_at);
