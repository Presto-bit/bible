"""小爱 RUM 耗时打点入库（客户端 batch 上报）。"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)

_schema_lock = threading.Lock()
_schema_ready = False

_MAX_MARKS = 16
_MAX_DETAIL_BYTES = 2000


def ensure_ai_perf_schema(conn) -> None:
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_perf_marks (
              id BIGSERIAL PRIMARY KEY,
              device_id TEXT,
              user_id TEXT,
              name TEXT NOT NULL,
              ms INT NOT NULL,
              detail JSONB NOT NULL DEFAULT '{}'::jsonb,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS ai_perf_marks_name_created_idx
              ON ai_perf_marks (name, created_at DESC)
            """
        )
        conn.commit()
        _schema_ready = True


def record_ai_perf_marks(
    *,
    marks: list[dict[str, Any]],
    device_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    device = (device_id or "").strip()[:256] or None
    uid = (user_id or "").strip()[:64] or None
    if not device and not uid:
        return {"ok": False, "error": "missing_identity"}

    rows: list[tuple] = []
    for item in marks[:_MAX_MARKS]:
        name = str(item.get("name") or "").strip()[:64]
        if not name:
            continue
        try:
            ms = int(item.get("ms") or 0)
        except (TypeError, ValueError):
            continue
        if ms < 0 or ms > 600_000:
            continue
        detail = item.get("detail") if isinstance(item.get("detail"), dict) else {}
        try:
            raw = json.dumps(detail, ensure_ascii=False)
            if len(raw) > _MAX_DETAIL_BYTES:
                detail = {"_truncated": True}
        except (TypeError, ValueError):
            detail = {}
        rows.append((device, uid, name, ms, json.dumps(detail, ensure_ascii=False)))

    if not rows:
        return {"ok": False, "error": "no_valid_marks"}

    from ..db import get_pool

    try:
        with get_pool().connection() as conn:
            ensure_ai_perf_schema(conn)
            for device_v, uid_v, name, ms, detail_json in rows:
                conn.execute(
                    """
                    INSERT INTO ai_perf_marks (device_id, user_id, name, ms, detail)
                    VALUES (%s, %s, %s, %s, %s::jsonb)
                    """,
                    (device_v, uid_v, name, ms, detail_json),
                )
            conn.commit()
    except Exception as exc:
        logger.warning("ai perf marks insert failed: %s", exc)
        for _, _, name, ms, _ in rows:
            logger.info(
                "assistant_perf_fallback name=%s ms=%s device=%s",
                name,
                ms,
                device,
            )
        return {"ok": False, "error": "db_error", "logged": len(rows)}

    return {"ok": True, "count": len(rows)}
