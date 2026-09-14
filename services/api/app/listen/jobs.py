"""听经异步任务（进程内）。"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Any

from .synthesize import prepare_chapter

log = logging.getLogger(__name__)

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def get_job(job_id: str) -> dict | None:
    with _lock:
        j = _jobs.get(job_id)
        return dict(j) if j else None


def start_job(
    *,
    translation: str,
    book: str,
    chapter: int,
    voice: str,
) -> str:
    job_id = uuid.uuid4().hex[:16]
    with _lock:
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "pending",
            "translation": translation,
            "book": book,
            "chapter": chapter,
            "voice": voice,
            "created_at": time.time(),
        }

    def _run() -> None:
        try:
            ready = prepare_chapter(
                translation=translation,
                book=book,
                chapter=chapter,
                voice=voice,
            )
            with _lock:
                _jobs[job_id] = {
                    **_jobs.get(job_id, {}),
                    "status": "ready",
                    "result": {
                        k: ready[k]
                        for k in (
                            "text_hash",
                            "duration_ms",
                            "timeline",
                            "translation",
                            "voice",
                            "book",
                            "chapter",
                            "bytes",
                        )
                        if k in ready
                    },
                }
        except Exception as e:
            log.exception("listen job failed %s", job_id)
            with _lock:
                _jobs[job_id] = {
                    **_jobs.get(job_id, {}),
                    "status": "error",
                    "error": str(e)[:300],
                }

    threading.Thread(target=_run, name=f"listen-{job_id}", daemon=True).start()
    return job_id


def prune_jobs(max_age_sec: float = 3600) -> None:
    now = time.time()
    with _lock:
        dead = [k for k, v in _jobs.items() if now - float(v.get("created_at") or 0) > max_age_sec]
        for k in dead[:200]:
            _jobs.pop(k, None)
