-- 006：群计划绑定 + 群公告
ALTER TABLE social_group ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE social_group ADD COLUMN IF NOT EXISTS announcement TEXT;
