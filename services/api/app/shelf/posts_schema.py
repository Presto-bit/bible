"""书架书评 / 公开笔记 / 回复 schema。"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_DDL = """
CREATE TABLE IF NOT EXISTS shelf_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES shelf_platform_book(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('review', 'note')),
  ref TEXT NOT NULL,
  body TEXT NOT NULL,
  abstract TEXT,
  visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'friends', 'private')),
  section_id TEXT,
  page_index INT,
  span_start INT,
  span_end INT,
  read_status TEXT CHECK (read_status IS NULL OR read_status IN ('reading', 'finished')),
  likes_count INT NOT NULL DEFAULT 0,
  replies_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shelf_post_book_kind
  ON shelf_post (book_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shelf_post_book_section
  ON shelf_post (book_id, section_id, kind, visibility);
CREATE INDEX IF NOT EXISTS idx_shelf_post_user
  ON shelf_post (user_id, book_id, created_at DESC);
CREATE TABLE IF NOT EXISTS shelf_post_reply (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES shelf_post(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shelf_post_reply_post
  ON shelf_post_reply (post_id, created_at ASC);
CREATE TABLE IF NOT EXISTS shelf_post_like (
  post_id UUID NOT NULL REFERENCES shelf_post(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
"""


def ensure_shelf_posts_schema(pool) -> None:
    with pool.connection() as conn:
        conn.execute(_DDL)
        conn.commit()
    logger.info("shelf posts schema ready")
