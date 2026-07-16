"""RAG 索引异步队列：入队立即返回，后台线程执行，避免拖垮在线 API。"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..db import get_pool
from .rag_ops import (
    index_pending_disk,
    index_pending_uploads,
    index_rag_collections,
    index_upload_path,
    upload_dir,
)
from .rag_workspace import index_workspace_file

logger = logging.getLogger(__name__)

_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()
_WORKER_LOCK = threading.Lock()
_WORKER_STARTED = False

_ENSURE_SQL = """
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
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rag_index_job_status_idx
  ON rag_index_job (status, created_at ASC);
"""


def ensure_rag_job_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(_ENSURE_SQL)
            conn.commit()
        _SCHEMA_READY = True


def enqueue_rag_job(
    *,
    kind: str,
    payload: dict[str, Any] | None = None,
    created_by: str | None = None,
) -> dict:
    ensure_rag_job_schema()
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            """
            INSERT INTO rag_index_job (kind, payload, created_by)
            VALUES (%s, %s::jsonb, %s)
            RETURNING id::text, kind, status, created_at
            """,
            (kind, json.dumps(payload or {}), created_by),
        ).fetchone()
        conn.commit()
    job = {
        "id": row[0],
        "kind": row[1],
        "status": row[2],
        "created_at": row[3].isoformat() if row[3] else None,
        "payload": payload or {},
    }
    _kick_worker()
    return job


def get_rag_job(job_id: str) -> dict | None:
    ensure_rag_job_schema()
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            """
            SELECT id::text, kind, payload, status, progress, error,
                   created_by, created_at, started_at, finished_at
            FROM rag_index_job WHERE id = %s
            """,
            (job_id,),
        ).fetchone()
    if not row:
        return None
    return _row_to_job(row)


def list_rag_jobs(*, limit: int = 20) -> list[dict]:
    ensure_rag_job_schema()
    limit = max(1, min(limit, 50))
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT id::text, kind, payload, status, progress, error,
                   created_by, created_at, started_at, finished_at
            FROM rag_index_job
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    return [_row_to_job(r) for r in rows]


def _row_to_job(row) -> dict:
    payload = row[2]
    progress = row[4]
    if not isinstance(payload, dict):
        payload = {}
    if not isinstance(progress, dict):
        progress = {}
    return {
        "id": row[0],
        "kind": row[1],
        "payload": payload,
        "status": row[3],
        "progress": progress,
        "error": row[5],
        "created_by": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
        "started_at": row[8].isoformat() if row[8] else None,
        "finished_at": row[9].isoformat() if row[9] else None,
    }


def _set_job(job_id: str, *, status: str, progress: dict | None = None, error: str | None = None) -> None:
    pool = get_pool()
    prog = json.dumps(progress or {})
    with pool.connection() as conn:
        if status == "running":
            conn.execute(
                """
                UPDATE rag_index_job
                SET status = %s, progress = %s::jsonb,
                    started_at = COALESCE(started_at, now()), error = NULL
                WHERE id = %s
                """,
                (status, prog, job_id),
            )
        elif status in ("done", "failed", "cancelled"):
            conn.execute(
                """
                UPDATE rag_index_job
                SET status = %s, progress = %s::jsonb,
                    error = %s, finished_at = now()
                WHERE id = %s
                """,
                (status, prog, error, job_id),
            )
        else:
            conn.execute(
                "UPDATE rag_index_job SET status = %s, progress = %s::jsonb WHERE id = %s",
                (status, prog, job_id),
            )
        conn.commit()


def _claim_next_job() -> dict | None:
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute("BEGIN")
        try:
            row = conn.execute(
                """
                SELECT id::text, kind, payload
                FROM rag_index_job
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """
            ).fetchone()
            if not row:
                conn.execute("COMMIT")
                return None
            conn.execute(
                "UPDATE rag_index_job SET status = 'running', started_at = now() WHERE id = %s",
                (row[0],),
            )
            conn.execute("COMMIT")
        except Exception:
            try:
                conn.execute("ROLLBACK")
            except Exception:
                pass
            raise
    payload = row[2] if isinstance(row[2], dict) else {}
    return {"id": row[0], "kind": row[1], "payload": payload}


def _run_job(job: dict) -> dict:
    kind = job["kind"]
    payload = job.get("payload") or {}
    if kind == "pending_disk":
        return index_pending_disk(
            collection_id=payload.get("collection_id"),
            force=bool(payload.get("force", True)),
            limit=int(payload.get("limit") or 8),
        )
    if kind == "pending_uploads":
        return index_pending_uploads(
            source_type=(payload.get("source_type") or "commentary").strip(),
            force=bool(payload.get("force", True)),
        )
    if kind == "collections":
        return index_rag_collections(force=bool(payload.get("force", False)))
    if kind == "workspace_file":
        return index_workspace_file(
            collection_id=str(payload.get("collection_id") or ""),
            path=str(payload.get("path") or ""),
            force=bool(payload.get("force", True)),
        )
    if kind == "upload_file":
        safe = Path(str(payload.get("filename") or "")).name
        dest = upload_dir() / safe
        return index_upload_path(
            dest,
            title=(payload.get("title") or None),
            source_type=(payload.get("source_type") or "commentary").strip(),
            force=bool(payload.get("force", True)),
        )
    raise ValueError(f"未知任务类型：{kind}")


def process_one_rag_job() -> dict | None:
    job = _claim_next_job()
    if not job:
        return None
    job_id = job["id"]
    t0 = time.monotonic()
    try:
        _set_job(job_id, status="running", progress={"phase": "indexing"})
        result = _run_job(job)
        summary = {
            k: result.get(k)
            for k in (
                "ok", "pending", "processed", "has_more", "remaining",
                "indexed", "skipped", "failed", "stale_reset", "indexed_groups",
            )
            if isinstance(result, dict) and k in result
        }
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        progress = {"phase": "done", "elapsed_ms": elapsed_ms, **summary}
        _set_job(job_id, status="done", progress=progress)
        return {"id": job_id, "status": "done", "progress": progress}
    except Exception as exc:
        logger.exception("rag index job failed id=%s", job_id)
        _set_job(job_id, status="failed", progress={"phase": "failed"}, error=str(exc)[:800])
        return {"id": job_id, "status": "failed", "error": str(exc)}


def _worker_loop() -> None:
    idle_rounds = 0
    while True:
        try:
            ensure_rag_job_schema()
            out = process_one_rag_job()
            if out:
                idle_rounds = 0
                continue
            idle_rounds += 1
            time.sleep(1.5 if idle_rounds < 20 else 5.0)
        except Exception:
            logger.exception("rag index worker loop error")
            time.sleep(3.0)


def _kick_worker() -> None:
    global _WORKER_STARTED
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        t = threading.Thread(target=_worker_loop, name="rag-index-worker", daemon=True)
        t.start()
        _WORKER_STARTED = True
        logger.info("rag index worker started at %s", datetime.now(timezone.utc).isoformat())


def start_rag_index_worker() -> None:
    try:
        ensure_rag_job_schema()
    except Exception:
        logger.exception("ensure rag_index_job schema failed")
    _kick_worker()
