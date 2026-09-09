"""小爱服务端会话（P3 内存 + P5 PostgreSQL 持久化，DB 不可用时回退内存）。"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

_MAX_CONVERSATIONS = 512
_TTL_SEC = 7 * 24 * 3600
_MAX_TURNS = 12

_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()

_ENSURE_SQL = """
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT,
  user_id UUID REFERENCES users(id),
  scripture_ref TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT '',
  scene TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_device_updated
  ON ai_conversations (device_id, updated_at DESC)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON ai_conversations (user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ai_conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_msg_conv_created
  ON ai_conversation_messages (conversation_id, created_at);
"""


@dataclass
class StoredTurn:
    role: str
    content: str
    ts: float = field(default_factory=time.time)


@dataclass
class Conversation:
    id: str
    guest_id: str | None
    user_id: str | None
    ref: str
    mode: str
    scene: str
    turns: list[StoredTurn] = field(default_factory=list)
    updated_at: float = field(default_factory=time.time)


_lock = threading.Lock()
_store: dict[str, Conversation] = {}


_RESUME_TTL_SEC = 72 * 3600


def find_resumable_conversation(
    *,
    user_id: str | None,
    ref: str,
    mode: str,
) -> str | None:
    """登录用户同 ref+mode 72h 内最近会话（跨设备接续）。"""
    ref_norm = (ref or "").strip()
    mode_norm = (mode or "").strip() or "explain"
    if not user_id or not ref_norm:
        return None
    if ensure_conversation_schema():
        try:
            return _find_resumable_db(
                user_id=user_id,
                ref=ref_norm,
                mode=mode_norm,
            )
        except Exception as exc:
            logger.warning("find_resumable_conversation DB 失败，回退内存：%s", exc)
    return _find_resumable_memory(user_id=user_id, ref=ref_norm, mode=mode_norm)


def _find_resumable_memory(
    *,
    user_id: str,
    ref: str,
    mode: str,
) -> str | None:
    now = time.time()
    best: tuple[float, str] | None = None
    with _lock:
        for cid, conv in _store.items():
            if conv.user_id != user_id:
                continue
            if conv.ref != ref or conv.mode != mode:
                continue
            if now - conv.updated_at > _RESUME_TTL_SEC:
                continue
            if not conv.turns:
                continue
            if best is None or conv.updated_at > best[0]:
                best = (conv.updated_at, cid)
    return best[1] if best else None


def _find_resumable_db(
    *,
    user_id: str,
    ref: str,
    mode: str,
) -> str | None:
    from ..db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            """
            SELECT c.id::text
            FROM ai_conversations c
            WHERE c.user_id = %s
              AND c.scripture_ref = %s
              AND c.mode = %s
              AND c.updated_at > now() - make_interval(secs => %s)
              AND EXISTS (
                SELECT 1 FROM ai_conversation_messages m
                WHERE m.conversation_id = c.id
              )
            ORDER BY c.updated_at DESC
            LIMIT 1
            """,
            (user_id, ref, mode, _RESUME_TTL_SEC),
        ).fetchone()
    return row[0] if row else None


def ensure_conversation_schema() -> bool:
    """尝试建表；成功返回 True，失败则后续走内存。"""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return True
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return True
        try:
            from ..db import get_pool

            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(_ENSURE_SQL)
                conn.commit()
            _SCHEMA_READY = True
            return True
        except Exception as exc:
            logger.warning("ai_conversations 表不可用，回退内存会话：%s", exc)
            return False


def _prune_memory(now: float | None = None) -> None:
    now = now or time.time()
    if len(_store) <= _MAX_CONVERSATIONS:
        expired = [cid for cid, c in _store.items() if now - c.updated_at > _TTL_SEC]
        for cid in expired:
            _store.pop(cid, None)
    while len(_store) > _MAX_CONVERSATIONS:
        oldest = min(_store.items(), key=lambda kv: kv[1].updated_at)[0]
        _store.pop(oldest, None)


def _open_conversation_memory(
    conversation_id: str | None,
    *,
    guest_id: str | None,
    user_id: str | None,
    ref: str,
    mode: str,
    scene: str,
) -> str:
    with _lock:
        _prune_memory()
        cid = (conversation_id or "").strip()
        if cid and cid in _store:
            conv = _store[cid]
            conv.updated_at = time.time()
            if ref and not conv.ref:
                conv.ref = ref
            return cid
        new_id = cid or str(uuid.uuid4())
        _store[new_id] = Conversation(
            id=new_id,
            guest_id=guest_id,
            user_id=user_id,
            ref=ref or "",
            mode=mode or "",
            scene=scene or "",
        )
        return new_id


def _conversation_owned(
    conn,
    cid: str,
    *,
    device_id: str | None,
    user_id: str | None,
) -> bool:
    row = conn.execute(
        """
        SELECT device_id, user_id::text
        FROM ai_conversations
        WHERE id = %s
        """,
        (cid,),
    ).fetchone()
    if not row:
        return False
    row_device, row_user = row[0], row[1]
    if device_id and row_device and row_device == device_id:
        return True
    if user_id and row_user and row_user == user_id:
        return True
    if not row_device and not row_user:
        return True
    return False


def _open_conversation_db(
    conversation_id: str | None,
    *,
    device_id: str | None,
    user_id: str | None,
    ref: str,
    mode: str,
    scene: str,
) -> str:
    from ..db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        cid = (conversation_id or "").strip()
        if cid:
            try:
                uuid.UUID(cid)
            except ValueError:
                cid = ""
        if cid:
            if _conversation_owned(conn, cid, device_id=device_id, user_id=user_id):
                conn.execute(
                    """
                    UPDATE ai_conversations
                    SET updated_at = now(),
                        user_id = COALESCE(user_id, %s),
                        scripture_ref = CASE
                          WHEN scripture_ref = '' AND %s <> '' THEN %s
                          ELSE scripture_ref
                        END
                    WHERE id = %s
                    """,
                    (user_id, ref, ref, cid),
                )
                conn.commit()
                return cid
        new_id = cid or str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO ai_conversations
              (id, device_id, user_id, scripture_ref, mode, scene)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET updated_at = now()
            """,
            (new_id, device_id, user_id, ref or "", mode or "", scene or ""),
        )
        conn.commit()
        return new_id


def open_conversation(
    conversation_id: str | None,
    *,
    guest_id: str | None,
    user_id: str | None,
    ref: str,
    mode: str,
    scene: str,
) -> str:
    """新建或续用会话，返回 conversation_id。"""
    device_id = guest_id
    if ensure_conversation_schema():
        try:
            return _open_conversation_db(
                conversation_id,
                device_id=device_id,
                user_id=user_id,
                ref=ref,
                mode=mode,
                scene=scene,
            )
        except Exception as exc:
            logger.warning("open_conversation DB 失败，回退内存：%s", exc)
    return _open_conversation_memory(
        conversation_id,
        guest_id=guest_id,
        user_id=user_id,
        ref=ref,
        mode=mode,
        scene=scene,
    )


def _history_memory(conversation_id: str, *, limit: int) -> list[dict[str, str]]:
    with _lock:
        conv = _store.get(conversation_id)
        if not conv:
            return []
        turns = conv.turns[-limit:]
        return [{"role": t.role, "content": t.content} for t in turns]


def _history_db(conversation_id: str, *, limit: int) -> list[dict[str, str]]:
    from ..db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT role, content
            FROM ai_conversation_messages
            WHERE conversation_id = %s
            ORDER BY created_at DESC, id DESC
            LIMIT %s
            """,
            (conversation_id, limit),
        ).fetchall()
    rows.reverse()
    return [{"role": r[0], "content": r[1]} for r in rows]


def history_for_prompt(conversation_id: str, *, limit: int = _MAX_TURNS) -> list[dict[str, str]]:
    if not conversation_id:
        return []
    if ensure_conversation_schema():
        try:
            return _history_db(conversation_id, limit=limit)
        except Exception as exc:
            logger.warning("history_for_prompt DB 失败，回退内存：%s", exc)
    return _history_memory(conversation_id, limit=limit)


def _append_memory(
    conversation_id: str,
    *,
    user_content: str,
    assistant_content: str,
) -> None:
    now = time.time()
    with _lock:
        conv = _store.get(conversation_id)
        if not conv:
            return
        if user_content.strip():
            conv.turns.append(StoredTurn(role="user", content=user_content.strip(), ts=now))
        if assistant_content.strip():
            conv.turns.append(
                StoredTurn(role="assistant", content=assistant_content.strip(), ts=now + 0.001),
            )
        conv.turns = conv.turns[-_MAX_TURNS:]
        conv.updated_at = now


def _append_db(
    conversation_id: str,
    *,
    user_content: str,
    assistant_content: str,
) -> None:
    from ..db import get_pool

    pool = get_pool()
    with pool.connection() as conn:
        if user_content.strip():
            conn.execute(
                """
                INSERT INTO ai_conversation_messages (conversation_id, role, content)
                VALUES (%s, 'user', %s)
                """,
                (conversation_id, user_content.strip()),
            )
        if assistant_content.strip():
            conn.execute(
                """
                INSERT INTO ai_conversation_messages (conversation_id, role, content)
                VALUES (%s, 'assistant', %s)
                """,
                (conversation_id, assistant_content.strip()),
            )
        conn.execute(
            "UPDATE ai_conversations SET updated_at = now() WHERE id = %s",
            (conversation_id,),
        )
        # 保留最近 N 轮（user+assistant 各算一条）
        conn.execute(
            """
            DELETE FROM ai_conversation_messages
            WHERE conversation_id = %s
              AND id NOT IN (
                SELECT id FROM ai_conversation_messages
                WHERE conversation_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s
              )
            """,
            (conversation_id, conversation_id, _MAX_TURNS * 2),
        )
        conn.commit()


def append_turns(
    conversation_id: str,
    *,
    user_content: str,
    assistant_content: str,
) -> None:
    if not conversation_id:
        return
    if ensure_conversation_schema():
        try:
            _append_db(
                conversation_id,
                user_content=user_content,
                assistant_content=assistant_content,
            )
            return
        except Exception as exc:
            logger.warning("append_turns DB 失败，回退内存：%s", exc)
    _append_memory(
        conversation_id,
        user_content=user_content,
        assistant_content=assistant_content,
    )


def merge_client_history(
    server_history: list[dict[str, str]],
    client_history: list[dict[str, str]] | None,
) -> list[dict[str, str]]:
    """local-first：客户端 history 优先；仅 conversation_id 时用服务端。"""
    if client_history:
        return client_history
    return server_history
