"""彼爱团队触达：欢迎信 / 全员信 / 用户反馈表（幂等补齐）。"""
from __future__ import annotations

import logging
import threading

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_ready = False

_STATEMENTS: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS platform_outreach_job (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kind TEXT NOT NULL CHECK (kind IN ('welcome', 'broadcast')),
      template_key TEXT,
      title TEXT,
      body TEXT NOT NULL,
      ref JSONB,
      audience TEXT NOT NULL DEFAULT 'all',
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT,
      total_targets INT NOT NULL DEFAULT 0,
      sent_count INT NOT NULL DEFAULT 0,
      skipped_count INT NOT NULL DEFAULT 0,
      failed_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at TIMESTAMPTZ
    )
    """,
    """
    ALTER TABLE platform_outreach_job
      ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0
    """,
    """
    ALTER TABLE platform_outreach_job
      ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0
    """,
    """
    ALTER TABLE platform_outreach_job DROP CONSTRAINT IF EXISTS platform_outreach_job_status_check
    """,
    """
    ALTER TABLE platform_outreach_job
      ADD CONSTRAINT platform_outreach_job_status_check
      CHECK (status IN ('draft', 'queued', 'sending', 'done', 'failed'))
    """,
    """
    CREATE TABLE IF NOT EXISTS platform_outreach_queue (
      job_id UUID NOT NULL REFERENCES platform_outreach_job(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      done_at TIMESTAMPTZ,
      last_error TEXT,
      PRIMARY KEY (job_id, user_id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS platform_outreach_queue_pending_idx
      ON platform_outreach_queue (job_id)
      WHERE done_at IS NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS platform_outreach_delivery (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_key TEXT,
      job_id UUID REFERENCES platform_outreach_job(id) ON DELETE SET NULL,
      message_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS platform_outreach_delivery_user_template_uq
      ON platform_outreach_delivery (user_id, template_key)
      WHERE template_key IS NOT NULL
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS platform_outreach_delivery_user_job_uq
      ON platform_outreach_delivery (user_id, job_id)
      WHERE job_id IS NOT NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS user_feedback (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      scene TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS user_feedback_created_idx ON user_feedback (created_at DESC)",
)


def ensure_outreach_schema(conn) -> bool:
    global _ready
    if _ready:
        return True
    with _lock:
        if _ready:
            return True
        try:
            for sql in _STATEMENTS:
                conn.execute(sql)
            conn.commit()
            _ready = True
            logger.info("platform outreach schema ensured")
            return True
        except Exception:
            logger.exception("ensure_outreach_schema failed")
            try:
                conn.rollback()
            except Exception:
                pass
            return False
