-- 011：群内个人显示名称（与全局 display_name 独立）
ALTER TABLE group_member ADD COLUMN IF NOT EXISTS display_name TEXT;
