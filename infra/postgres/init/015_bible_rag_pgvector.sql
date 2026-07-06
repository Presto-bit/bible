-- pgvector ANN 列与 HNSW 索引（可选；无扩展时 API 自动回退 JSONB）

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE bible_rag_chunks
  ADD COLUMN IF NOT EXISTS embedding_vec vector(1024);

CREATE INDEX IF NOT EXISTS idx_bible_rag_chunks_embedding_hnsw
  ON bible_rag_chunks USING hnsw (embedding_vec vector_cosine_ops);
