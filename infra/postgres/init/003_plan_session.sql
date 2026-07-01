-- 计划阅读会话（段进度）随 plan_progress 同步
ALTER TABLE plan_progress ADD COLUMN IF NOT EXISTS session JSONB;
