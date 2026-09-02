-- 平台书架（管理员上传，全员只读）
CREATE TABLE IF NOT EXISTS shelf_platform_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  mime TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  storage_key TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_sha256 TEXT,
  toc_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'published',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shelf_platform_status_sort
  ON shelf_platform_book (status, sort_order DESC, created_at DESC);
