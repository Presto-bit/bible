"""每日经文暖场：管理端开关与参数（存 admin_runtime_settings）。"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from ..time_cn import china_today

SETTINGS_KEY = "daily_verse_warm"

DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "t0": None,
    "ramp_days": 50,
    "cap_min": 10,
    "cap_max": 100,
    "max_boost": 20,
}


def ensure_warm_settings_schema(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_runtime_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def _merge(raw: Any) -> dict[str, Any]:
    out = dict(DEFAULTS)
    if isinstance(raw, dict):
        for k in DEFAULTS:
            if k in raw and raw[k] is not None:
                out[k] = raw[k]
    if not out.get("t0"):
        out["t0"] = china_today().isoformat()
    return out


def get_warm_settings(conn) -> dict[str, Any]:
    ensure_warm_settings_schema(conn)
    row = conn.execute(
        "SELECT value FROM admin_runtime_settings WHERE key = %s",
        (SETTINGS_KEY,),
    ).fetchone()
    if not row:
        return _merge({})
    val = row[0]
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except json.JSONDecodeError:
            val = {}
    return _merge(val)


def save_warm_settings(conn, patch: dict[str, Any]) -> dict[str, Any]:
    ensure_warm_settings_schema(conn)
    current = get_warm_settings(conn)
    for k in DEFAULTS:
        if k in patch:
            current[k] = patch[k]
    if current.get("enabled") and not patch.get("t0") and not current.get("t0"):
        current["t0"] = china_today().isoformat()
    t0 = current.get("t0")
    if t0:
        try:
            date.fromisoformat(str(t0))
        except ValueError as exc:
            raise ValueError("invalid_t0") from exc
    for num_key in ("ramp_days", "cap_min", "cap_max", "max_boost"):
        try:
            current[num_key] = int(current[num_key])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid_{num_key}") from exc
    current["enabled"] = bool(current.get("enabled"))
    if current["cap_min"] < 1 or current["cap_max"] < current["cap_min"]:
        raise ValueError("invalid_cap_range")
    if current["cap_max"] > 99:
        current["cap_max"] = 99
    if current["ramp_days"] < 1:
        current["ramp_days"] = 1
    conn.execute(
        """
        INSERT INTO admin_runtime_settings (key, value, updated_at)
        VALUES (%s, %s::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = now()
        """,
        (SETTINGS_KEY, json.dumps(current, ensure_ascii=False)),
    )
    return current


def settings_public_view(settings: dict[str, Any]) -> dict[str, Any]:
    return {**settings, "t0": str(settings.get("t0") or "")}
