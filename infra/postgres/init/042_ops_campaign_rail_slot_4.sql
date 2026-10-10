-- 今日推荐第 4 格（探索）可挂载活动：rail_slot 1～4

DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'ops_campaign'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%rail_slot%'
  LOOP
    EXECUTE format('ALTER TABLE ops_campaign DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

ALTER TABLE ops_campaign
  ADD CONSTRAINT ops_campaign_rail_slot_check
  CHECK (rail_slot BETWEEN 1 AND 4);
