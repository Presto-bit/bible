"""获客三级渠道：校验清洗 + First Touch 幂等写入。"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

CHANNEL_L1 = frozenset({"organic", "share", "campaign", "social", "ads", "unknown"})

_SLUG_RE = re.compile(r"[^a-z0-9_.:-]+")


def sanitize_slug(value: str | None, *, max_len: int) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    cleaned = _SLUG_RE.sub("", raw.replace(" ", "_"))
    return cleaned[:max_len]


def normalize_channels(
    *,
    channel_l1: str | None,
    channel_l2: str | None = None,
    channel_l3: str | None = None,
) -> tuple[str, str, str]:
    l1 = sanitize_slug(channel_l1, max_len=32)
    if l1 not in CHANNEL_L1:
        l1 = "unknown" if (channel_l1 or "").strip() else "organic"
    l2 = sanitize_slug(channel_l2, max_len=64)
    l3 = sanitize_slug(channel_l3, max_len=128)
    if l1 == "organic" and not l2:
        l2 = "direct"
    return l1, l2, l3


def _parse_captured_at(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def bind_user_acquisition(
    *,
    user_code: str,
    channel_l1: str | None,
    channel_l2: str | None = None,
    channel_l3: str | None = None,
    raw_params: dict[str, Any] | None = None,
    landing_path: str | None = None,
    referrer_host: str | None = None,
    device_id: str | None = None,
    captured_at: Any = None,
) -> dict[str, Any]:
    """写入 First Touch。已存在则返回 existing=True，不覆盖。"""
    from ..db import get_pool

    code = (user_code or "").strip()
    if not code:
        return {"ok": False, "bound": False, "error": "missing_user_code"}

    l1, l2, l3 = normalize_channels(
        channel_l1=channel_l1, channel_l2=channel_l2, channel_l3=channel_l3
    )
    params = raw_params if isinstance(raw_params, dict) else {}
    path = (landing_path or "").strip()[:512]
    ref_host = (referrer_host or "").strip().lower()[:128]
    if ref_host.startswith("http://") or ref_host.startswith("https://"):
        try:
            from urllib.parse import urlparse

            ref_host = (urlparse(ref_host).hostname or ref_host)[:128]
        except Exception:
            ref_host = ref_host[:128]
    device = (device_id or "").strip()[:256] or None
    captured = _parse_captured_at(captured_at)

    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            """
            INSERT INTO user_acquisition (
              user_code, channel_l1, channel_l2, channel_l3,
              raw_params, landing_path, referrer_host, device_id,
              captured_at, bound_at
            ) VALUES (
              %s, %s, %s, %s,
              %s::jsonb, %s, %s, %s,
              %s, now()
            )
            ON CONFLICT (user_code) DO NOTHING
            RETURNING channel_l1, channel_l2, channel_l3, bound_at
            """,
            (
                code,
                l1,
                l2,
                l3,
                json.dumps(params, ensure_ascii=False),
                path,
                ref_host,
                device,
                captured,
            ),
        ).fetchone()
        conn.commit()
        if row:
            return {
                "ok": True,
                "bound": True,
                "existing": False,
                "channel_l1": row[0],
                "channel_l2": row[1],
                "channel_l3": row[2],
                "bound_at": row[3].isoformat() if row[3] else None,
            }
        existing = conn.execute(
            """
            SELECT channel_l1, channel_l2, channel_l3, bound_at
            FROM user_acquisition WHERE user_code = %s
            """,
            (code,),
        ).fetchone()
        if not existing:
            return {"ok": False, "bound": False, "error": "insert_failed"}
        return {
            "ok": True,
            "bound": False,
            "existing": True,
            "channel_l1": existing[0],
            "channel_l2": existing[1],
            "channel_l3": existing[2],
            "bound_at": existing[3].isoformat() if existing[3] else None,
        }
