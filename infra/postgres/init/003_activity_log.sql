-- 活动日计数（祷告/听读/书架/示意卡/知识库），对齐客户端 presto_activity_log
CREATE TABLE IF NOT EXISTS activity_log (
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  prayers INT NOT NULL DEFAULT 0,
  listen_minutes INT NOT NULL DEFAULT 0,
  shelf_checkins INT NOT NULL DEFAULT 0,
  shelf_posts INT NOT NULL DEFAULT 0,
  visual_cards INT NOT NULL DEFAULT 0,
  knowledge_steps INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  server_seq BIGINT NOT NULL DEFAULT nextval('user_data_seq'),
  device_id TEXT,
  client_ts TIMESTAMPTZ,
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_activity_log_seq ON activity_log (user_id, server_seq);
