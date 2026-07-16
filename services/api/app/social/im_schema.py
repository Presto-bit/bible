"""社交 IM v1.2 schema 幂等兜底（等同 021_social_im_v12.sql）。

生产若未手动跑迁移，首次社交接口 / 启动时自动补齐，避免发现页/私信/群聊整片 500。
"""
from __future__ import annotations

import logging
import threading

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_ready = False

_STATEMENTS: tuple[str, ...] = (
    """
    ALTER TABLE social_group
      ADD COLUMN IF NOT EXISTS allow_chat BOOLEAN NOT NULL DEFAULT true
    """,
    "ALTER TABLE group_message ADD COLUMN IF NOT EXISTS reply_to_id UUID",
    "ALTER TABLE group_message ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ",
    """
    ALTER TABLE group_message
      ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb
    """,
    """
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'group_message_reply_to_fk'
      ) THEN
        ALTER TABLE group_message
          ADD CONSTRAINT group_message_reply_to_fk
          FOREIGN KEY (reply_to_id) REFERENCES group_message(id) ON DELETE SET NULL;
      END IF;
    END $$
    """,
    "CREATE INDEX IF NOT EXISTS group_message_created_idx ON group_message (created_at)",
    """
    CREATE INDEX IF NOT EXISTS group_message_group_active_idx
      ON group_message (group_id, created_at DESC)
      WHERE recalled_at IS NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS friend_request (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      CONSTRAINT friend_request_status_chk
        CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      CONSTRAINT friend_request_not_self CHECK (from_user_id <> to_user_id)
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS friend_request_pending_uq
      ON friend_request (from_user_id, to_user_id)
      WHERE status = 'pending'
    """,
    """
    CREATE INDEX IF NOT EXISTS friend_request_to_pending_idx
      ON friend_request (to_user_id, created_at DESC)
      WHERE status = 'pending'
    """,
    """
    CREATE TABLE IF NOT EXISTS direct_thread (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_low_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT direct_thread_ordered CHECK (user_low_id < user_high_id),
      CONSTRAINT direct_thread_pair_uq UNIQUE (user_low_id, user_high_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS direct_message (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id UUID NOT NULL REFERENCES direct_thread(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL DEFAULT 'chat',
      body TEXT,
      ref TEXT,
      reply_to_id UUID REFERENCES direct_message(id) ON DELETE SET NULL,
      recalled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT direct_message_kind_chk
        CHECK (kind IN ('chat', 'verse', 'image', 'file', 'system'))
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS direct_message_thread_idx
      ON direct_message (thread_id, created_at DESC)
    """,
    "CREATE INDEX IF NOT EXISTS direct_message_created_idx ON direct_message (created_at)",
    """
    CREATE INDEX IF NOT EXISTS direct_message_thread_active_idx
      ON direct_message (thread_id, created_at DESC)
      WHERE recalled_at IS NULL
    """,
    """
    CREATE TABLE IF NOT EXISTS conversation_state (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      last_read_at TIMESTAMPTZ,
      pinned_at TIMESTAMPTZ,
      muted BOOLEAN NOT NULL DEFAULT false,
      hidden_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, scope, ref_id),
      CONSTRAINT conversation_state_scope_chk
        CHECK (scope IN ('group', 'dm', 'inbox_friends', 'inbox_groups'))
    )
    """,
    "CREATE INDEX IF NOT EXISTS conversation_state_user_idx ON conversation_state (user_id)",
    # 已有库补列：从消息列表「删除」= 隐藏至有新消息
    "ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ",
    """
    CREATE TABLE IF NOT EXISTS message_attachment (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope TEXT NOT NULL,
      message_id UUID NOT NULL,
      storage_key TEXT NOT NULL,
      file_name TEXT,
      mime TEXT,
      size_bytes BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT message_attachment_scope_chk CHECK (scope IN ('group', 'dm'))
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS message_attachment_msg_idx
      ON message_attachment (scope, message_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS moderation_case (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT 'other',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ,
      resolution_note TEXT,
      CONSTRAINT moderation_case_target_chk
        CHECK (target_type IN ('group_message', 'dm', 'group', 'user')),
      CONSTRAINT moderation_case_reason_chk
        CHECK (reason IN ('spam', 'abuse', 'heresy', 'illegal', 'other')),
      CONSTRAINT moderation_case_status_chk
        CHECK (status IN ('open', 'actioned', 'dismissed'))
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS moderation_case_open_idx
      ON moderation_case (status, created_at DESC)
    """,
    """
    CREATE TABLE IF NOT EXISTS moderation_snapshot (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      case_id UUID NOT NULL REFERENCES moderation_case(id) ON DELETE CASCADE,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS moderation_snapshot_case_idx ON moderation_snapshot (case_id)",
)


def ensure_social_im_v12(conn) -> bool:
    """幂等补齐 IM v1.2 表/列。成功返回 True。"""
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
            logger.info("social IM v1.2 schema ensured")
            return True
        except Exception:
            logger.exception("ensure_social_im_v12 failed")
            try:
                conn.rollback()
            except Exception:
                pass
            return False


def ensure_social_im_v12_pool(pool) -> bool:
    # 已就绪则不再占连接（会话列表高频路径）
    if _ready:
        return True
    try:
        with pool.connection() as conn:
            return ensure_social_im_v12(conn)
    except Exception:
        logger.exception("ensure_social_im_v12_pool failed")
        return False
