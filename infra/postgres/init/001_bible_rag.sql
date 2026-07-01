-- Bible App RAG 向量表（参考 minimax_aipodcast 00201_note_rag.sql）

CREATE TABLE IF NOT EXISTS bible_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  document_summary TEXT,
  rag_body_hash TEXT,
  rag_embedding_sig TEXT,
  rag_index_error TEXT,
  rag_index_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bible_rag_chunks (
  document_id UUID NOT NULL REFERENCES bible_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding JSONB NOT NULL,
  chunk_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_bible_rag_chunks_doc ON bible_rag_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_bible_rag_chunks_meta ON bible_rag_chunks USING gin (chunk_meta);

-- 游客设备（登录不强推阶段仍记录 device_id 供 API 限流）
CREATE TABLE IF NOT EXISTS guest_devices (
  guest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户与同步（二期）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  guest_id UUID REFERENCES guest_devices(guest_id),
  user_id UUID REFERENCES users(id),
  usage_date DATE NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (guest_id, usage_date)
);
