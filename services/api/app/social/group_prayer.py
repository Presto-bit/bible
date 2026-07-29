"""共读群结构化代祷清单。"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS group_prayer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'group'
    CHECK (privacy IN ('group', 'staff')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'archived')),
  tag TEXT NOT NULL DEFAULT '',
  answered_note TEXT NOT NULL DEFAULT '',
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS group_prayer_group_status_idx
  ON group_prayer (group_id, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS group_prayer_claim (
  prayer_id UUID NOT NULL REFERENCES group_prayer(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (prayer_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_prayer_claim_user_idx
  ON group_prayer_claim (user_id, created_at DESC);
"""

_ensured = False


def ensure_group_prayer_schema(pool) -> None:
    global _ensured
    if _ensured:
        return
    try:
        with pool.connection() as conn:
            conn.execute(_SCHEMA_SQL)
            conn.commit()
        _ensured = True
    except Exception:
        logger.exception("ensure_group_prayer_schema failed")
        raise
