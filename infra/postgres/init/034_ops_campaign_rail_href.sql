-- 今日推荐卡可配跳转（站内路径或 http(s) 外链）；空则默认落地页
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS rail_href TEXT NOT NULL DEFAULT '';
