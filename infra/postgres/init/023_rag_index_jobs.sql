-- RAG 索引异步任务队列（与在线 HTTP 请求隔离）
CREATE TABLE IF NOT EXISTS rag_index_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT rag_index_job_kind_chk CHECK (
    kind IN (
      'pending_disk',
      'pending_uploads',
      'collections',
      'workspace_file',
      'upload_file'
    )
  ),
  CONSTRAINT rag_index_job_status_chk CHECK (
    status IN ('queued', 'running', 'done', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS rag_index_job_status_idx
  ON rag_index_job (status, created_at ASC);

CREATE INDEX IF NOT EXISTS rag_index_job_created_idx
  ON rag_index_job (created_at DESC);
