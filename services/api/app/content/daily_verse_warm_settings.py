"""每日经文暖场：管理端开关与参数（存 admin_runtime_settings）。"""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from ..time_cn import china_today

SETTINGS_KEY = "daily_verse_warm"

DEFAULT_PROGRESS_KNOTS: list[dict[str, float]] = [
    {"hour": 6.0, "progress": 0.0},
    {"hour": 8.0, "progress": 0.14},
    {"hour": 10.0, "progress": 0.26},
    {"hour": 12.0, "progress": 0.38},
    {"hour": 14.0, "progress": 0.48},
    {"hour": 17.0, "progress": 0.62},
    {"hour": 19.0, "progress": 0.76},
    {"hour": 21.0, "progress": 0.90},
    {"hour": 23.0, "progress": 1.0},
]

DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "t0": None,
    "ramp_days": 50,
    "cap_min": 10,
    "cap_max": 100,
    "max_boost": 20,
    "cron_max_writes": 8,
    "manual_max_writes": 2,
    "catch_up_max_writes": 12,
    "catch_up_policy": "spread_by_remaining_slots",
    "day_start_hour": 6,
    "day_end_hour": 23,
    "progress_knots": None,
    "cron_interval_minutes": 30,
    "behavior_like_only": 0.62,
    "behavior_react_only": 0.18,
    "behavior_both": 0.20,
    "backdate_min_minutes": 5,
    "backdate_max_minutes": 75,
    "use_day_spread_timestamps": False,
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


def progress_knots_from_settings(settings: dict[str, Any]) -> list[tuple[float, float]]:
    raw = settings.get("progress_knots")
    knots: list[tuple[float, float]] = []
    if isinstance(raw, list) and raw:
        for item in raw:
            if isinstance(item, dict) and "hour" in item and "progress" in item:
                knots.append((float(item["hour"]), float(item["progress"])))
    if not knots:
        knots = [(k["hour"], k["progress"]) for k in DEFAULT_PROGRESS_KNOTS]
    knots.sort(key=lambda x: x[0])
    return knots


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
    int_keys = (
        "ramp_days",
        "cap_min",
        "cap_max",
        "max_boost",
        "cron_max_writes",
        "manual_max_writes",
        "catch_up_max_writes",
        "day_start_hour",
        "day_end_hour",
        "cron_interval_minutes",
        "backdate_min_minutes",
        "backdate_max_minutes",
    )
    for num_key in int_keys:
        try:
            current[num_key] = int(current[num_key])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid_{num_key}") from exc
    for float_key in ("behavior_like_only", "behavior_react_only", "behavior_both"):
        try:
            current[float_key] = float(current[float_key])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid_{float_key}") from exc
    current["enabled"] = bool(current.get("enabled"))
    current["use_day_spread_timestamps"] = bool(current.get("use_day_spread_timestamps"))
    policy = str(current.get("catch_up_policy") or "spread_by_remaining_slots")
    if policy not in ("per_tick_cap", "spread_by_remaining_slots"):
        raise ValueError("invalid_catch_up_policy")
    current["catch_up_policy"] = policy
    if current["cap_min"] < 1 or current["cap_max"] < current["cap_min"]:
        raise ValueError("invalid_cap_range")
    if current["cap_max"] > 99:
        current["cap_max"] = 99
    if current["ramp_days"] < 1:
        current["ramp_days"] = 1
    for wkey in ("cron_max_writes", "manual_max_writes", "catch_up_max_writes"):
        if current[wkey] < 1 or current[wkey] > 30:
            raise ValueError(f"invalid_{wkey}")
    if current["manual_max_writes"] > current["cron_max_writes"]:
        raise ValueError("manual_max_writes_exceeds_cron")
    if current["day_start_hour"] < 0 or current["day_end_hour"] > 24:
        raise ValueError("invalid_day_hours")
    if current["day_end_hour"] <= current["day_start_hour"]:
        raise ValueError("invalid_day_hours")
    if current["cron_interval_minutes"] < 1:
        current["cron_interval_minutes"] = 1
    b_sum = (
        current["behavior_like_only"]
        + current["behavior_react_only"]
        + current["behavior_both"]
    )
    if abs(b_sum - 1.0) > 0.001:
        raise ValueError("invalid_behavior_ratios")
    if current["backdate_min_minutes"] < 0 or current["backdate_max_minutes"] < current["backdate_min_minutes"]:
        raise ValueError("invalid_backdate_range")
    pk = current.get("progress_knots")
    if pk is not None:
        if not isinstance(pk, list):
            raise ValueError("invalid_progress_knots")
        parsed: list[dict[str, float]] = []
        for item in pk:
            if not isinstance(item, dict):
                raise ValueError("invalid_progress_knots")
            parsed.append({"hour": float(item["hour"]), "progress": float(item["progress"])})
        current["progress_knots"] = parsed
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
    out = {**settings, "t0": str(settings.get("t0") or "")}
    if out.get("progress_knots") is None:
        out["progress_knots"] = list(DEFAULT_PROGRESS_KNOTS)
    return out
