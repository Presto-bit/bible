"""小爱解读分享快照：完整回答 + 来源摘要，供跨设备落地页。"""
from __future__ import annotations

import json
import logging
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from ..db import get_pool

logger = logging.getLogger(__name__)

_SCHEMA_READY = False
_SCHEMA_LOCK = threading.Lock()
_ANSWER_MAX = 8000
_LEAD_MAX = 120
_REF_MAX = 64
_TTL_DAYS = 180

_ENSURE_SQL = """
CREATE TABLE IF NOT EXISTS analysis_share_snapshot (
  id TEXT PRIMARY KEY,
  ref_label TEXT NOT NULL DEFAULT '',
  ref_param TEXT NOT NULL DEFAULT '',
  lead TEXT NOT NULL DEFAULT '',
  answer_markdown TEXT NOT NULL DEFAULT '',
  citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  creator_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS analysis_share_snapshot_expires_idx
  ON analysis_share_snapshot (expires_at);
"""


def ensure_analysis_share_schema() -> None:
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    with _SCHEMA_LOCK:
        if _SCHEMA_READY:
            return
        try:
            pool = get_pool()
            with pool.connection() as conn:
                conn.execute(_ENSURE_SQL)
                conn.commit()
            _SCHEMA_READY = True
        except Exception:
            logger.exception("analysis_share_snapshot schema failed")


def _new_id() -> str:
    return secrets.token_urlsafe(10).replace("-", "").replace("_", "")[:14]


def _clip(text: str, max_len: int) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max(1, max_len - 1)] + "…"


def _normalize_citations(raw: list[Any] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not raw:
        return out
    for item in raw[:12]:
        if not isinstance(item, dict):
            continue
        try:
            n = int(item.get("n") or 0)
        except (TypeError, ValueError):
            continue
        if n <= 0:
            continue
        title = str(item.get("title") or "").strip()[:200]
        snippet = str(item.get("snippet") or "").strip()[:600]
        doc_id = item.get("document_id")
        out.append(
            {
                "n": n,
                "title": title,
                "snippet": snippet,
                "document_id": str(doc_id) if doc_id else None,
                "score": float(item.get("score") or 0),
            }
        )
    return out


def create_snapshot(
    *,
    ref_label: str,
    ref_param: str = "",
    answer_markdown: str,
    lead: str = "",
    citations: list[Any] | None = None,
    creator_code: str | None = None,
) -> dict[str, Any]:
    ensure_analysis_share_schema()
    answer = _clip(answer_markdown, _ANSWER_MAX)
    if not answer:
        raise ValueError("empty answer")
    label = _clip(ref_label or "小爱的解读", _REF_MAX) or "小爱的解读"
    param = _clip(ref_param or "", _REF_MAX)
    lead_text = _clip(lead or "", _LEAD_MAX)
    if not lead_text:
        lead_text = _clip(answer.replace("\n", " "), _LEAD_MAX)
    cites = _normalize_citations(citations)
    sid = _new_id()
    expires = datetime.now(timezone.utc) + timedelta(days=_TTL_DAYS)
    creator = (creator_code or "").strip()[:32] or None
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute(
            "INSERT INTO analysis_share_snapshot "
            "(id, ref_label, ref_param, lead, answer_markdown, citations_json, creator_code, expires_at) "
            "VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)",
            (
                sid,
                label,
                param,
                lead_text,
                answer,
                json.dumps(cites, ensure_ascii=False),
                creator,
                expires,
            ),
        )
        conn.commit()
    return {
        "id": sid,
        "ref_label": label,
        "ref_param": param,
        "lead": lead_text,
        "answer_markdown": answer,
        "citations": cites,
        "expires_at": expires.isoformat(),
    }


def get_snapshot(snapshot_id: str) -> dict[str, Any] | None:
    ensure_analysis_share_schema()
    sid = (snapshot_id or "").strip()
    if not sid or len(sid) > 32:
        return None
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT id, ref_label, ref_param, lead, answer_markdown, citations_json, "
            "created_at, expires_at "
            "FROM analysis_share_snapshot WHERE id = %s",
            (sid,),
        ).fetchone()
    if not row:
        return None
    expires = row[7]
    if expires is not None:
        exp = expires if getattr(expires, "tzinfo", None) else expires.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return None
    cites_raw = row[5]
    if isinstance(cites_raw, str):
        try:
            cites_raw = json.loads(cites_raw)
        except json.JSONDecodeError:
            cites_raw = []
    if not isinstance(cites_raw, list):
        cites_raw = []
    return {
        "id": row[0],
        "ref_label": row[1] or "小爱的解读",
        "ref_param": row[2] or "",
        "lead": row[3] or "",
        "answer_markdown": row[4] or "",
        "citations": cites_raw,
        "created_at": row[6].isoformat() if row[6] else None,
        "expires_at": expires.isoformat() if expires else None,
    }
