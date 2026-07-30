"""产品功能事件：入库、校验、管理台聚合。"""
from __future__ import annotations

import json
import logging
import threading
from datetime import date
from typing import Any

logger = logging.getLogger(__name__)

# 固定 12 个产品事件（与客户端 track 对齐）
PRODUCT_EVENT_NAMES = frozenset(
    {
        "app_open",
        "daily_verse_view",
        "daily_verse_like",
        "reader_open",
        "reader_session_end",
        "plan_start",
        "plan_day_done",
        "ai_ask",
        "reminder_enable",
        "warmup_finish",
        "discover_open",
        "share_out",
    }
)

EVENT_LABELS: dict[str, str] = {
    "app_open": "打开 App",
    "daily_verse_view": "看今日经文",
    "daily_verse_like": "点赞今日经文",
    "reader_open": "打开阅读器",
    "reader_session_end": "结束阅读会话",
    "plan_start": "开始计划",
    "plan_day_done": "完成计划日",
    "ai_ask": "提问 AI",
    "reminder_enable": "开启提醒",
    "warmup_finish": "完成今日温习",
    "discover_open": "打开发现",
    "share_out": "外部分享",
}

_schema_lock = threading.Lock()
_schema_ready = False


def ensure_product_events_schema(conn) -> None:
    """缺表时就地补齐，避免迁移未跑导致打点静默失败。"""
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS product_events (
              id BIGSERIAL PRIMARY KEY,
              event_name TEXT NOT NULL,
              user_code TEXT,
              device_id TEXT,
              props JSONB NOT NULL DEFAULT '{}'::jsonb,
              path TEXT NOT NULL DEFAULT '',
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS product_events_name_created_idx
              ON product_events (event_name, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS product_events_user_created_idx
              ON product_events (user_code, created_at DESC)
              WHERE user_code IS NOT NULL AND trim(user_code) <> ''
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS product_events_created_idx
              ON product_events (created_at DESC)
            """
        )
        conn.commit()
        _schema_ready = True


def normalize_event_name(name: str | None) -> str | None:
    key = (name or "").strip().lower()
    if key in PRODUCT_EVENT_NAMES:
        return key
    return None


def record_product_event(
    *,
    event_name: str,
    user_code: str | None = None,
    device_id: str | None = None,
    props: dict[str, Any] | None = None,
    path: str | None = None,
) -> dict[str, Any]:
    name = normalize_event_name(event_name)
    if not name:
        return {"ok": False, "error": "invalid_event"}

    code = (user_code or "").strip() or None
    device = (device_id or "").strip()[:256] or None
    if not code and not device:
        return {"ok": False, "error": "missing_identity"}

    payload = props if isinstance(props, dict) else {}
    # 限制 props 体积，避免滥用
    try:
        raw = json.dumps(payload, ensure_ascii=False)
        if len(raw) > 4000:
            payload = {"_truncated": True}
            raw = json.dumps(payload, ensure_ascii=False)
    except (TypeError, ValueError):
        payload = {}
        raw = "{}"

    path_text = (path or "").strip()[:512]

    from ..db import get_pool

    pool = get_pool()
    try:
        with pool.connection() as conn:
            ensure_product_events_schema(conn)
            conn.execute(
                """
                INSERT INTO product_events (event_name, user_code, device_id, props, path)
                VALUES (%s, %s, %s, %s::jsonb, %s)
                """,
                (name, code, device, raw, path_text),
            )
            conn.commit()
        return {"ok": True, "event": name}
    except Exception as exc:
        logger.warning("product_event write failed: %s", exc)
        return {"ok": False, "error": "write_failed"}


def product_events_today_count(conn) -> int:
    try:
        ensure_product_events_schema(conn)
        row = conn.execute(
            """
            SELECT count(*) FROM product_events
            WHERE (timezone('Asia/Shanghai', created_at))::date
              = (timezone('Asia/Shanghai', now()))::date
            """
        ).fetchone()
        return int(row[0] or 0) if row else 0
    except Exception:
        return 0


def product_events_series(conn, span_days: int) -> list[dict]:
    from ..time_cn import china_today
    from datetime import timedelta

    ensure_product_events_schema(conn)
    rows = conn.execute(
        """
        SELECT (timezone('Asia/Shanghai', created_at))::date::text, count(*)
        FROM product_events
        WHERE created_at >= (((timezone('Asia/Shanghai', now()))::date - %s::int)::timestamp
                             AT TIME ZONE 'Asia/Shanghai')
        GROUP BY (timezone('Asia/Shanghai', created_at))::date
        ORDER BY (timezone('Asia/Shanghai', created_at))::date
        """,
        (span_days - 1,),
    ).fetchall()
    by_date = {str(r[0]): int(r[1] or 0) for r in rows}
    start = china_today() - timedelta(days=span_days - 1)
    out: list[dict] = []
    for i in range(span_days):
        d = start + timedelta(days=i)
        key = d.isoformat()
        out.append({"date": key, "count": by_date.get(key, 0)})
    return out


def product_events_series_between(conn, start: date, end: date) -> list[dict]:
    ensure_product_events_schema(conn)
    rows = conn.execute(
        """
        SELECT (timezone('Asia/Shanghai', created_at))::date::text, count(*)
        FROM product_events
        WHERE (timezone('Asia/Shanghai', created_at))::date BETWEEN %s AND %s
        GROUP BY (timezone('Asia/Shanghai', created_at))::date
        ORDER BY (timezone('Asia/Shanghai', created_at))::date
        """,
        (start, end),
    ).fetchall()
    by_date = {str(r[0]): int(r[1] or 0) for r in rows}
    out: list[dict] = []
    d = start
    from datetime import timedelta

    while d <= end:
        key = d.isoformat()
        out.append({"date": key, "count": by_date.get(key, 0)})
        d += timedelta(days=1)
    return out


def feature_usage_ranking(conn, start: date, end: date) -> list[dict]:
    """功能使用排行：事件次数 + 去重用户。"""
    ensure_product_events_schema(conn)
    rows = conn.execute(
        """
        SELECT event_name,
               count(*) AS events,
               count(DISTINCT NULLIF(trim(user_code), '')) AS users
        FROM product_events
        WHERE (timezone('Asia/Shanghai', created_at))::date BETWEEN %s AND %s
        GROUP BY event_name
        ORDER BY events DESC, users DESC
        """,
        (start, end),
    ).fetchall()
    known = {r[0]: r for r in rows}
    out: list[dict] = []
    # 固定 12 项全量展示，无数据的补 0
    ranked = sorted(
        PRODUCT_EVENT_NAMES,
        key=lambda n: (-int(known[n][1]) if n in known else 0, n),
    )
    for name in ranked:
        r = known.get(name)
        out.append(
            {
                "event": name,
                "label": EVENT_LABELS.get(name, name),
                "events": int(r[1]) if r else 0,
                "users": int(r[2] or 0) if r else 0,
            }
        )
    return out


def activation_funnel(conn, start: date, end: date) -> list[dict]:
    """
    区间新注册用户激活漏斗（按 user_code）：
    注册 → 打开 → 看经文 → 互动(赞/读) → 习惯钩子(计划日/提醒/温习)
    """
    ensure_product_events_schema(conn)
    cohort = conn.execute(
        """
        SELECT DISTINCT COALESCE(a.user_code, up.user_code) AS user_code
        FROM users u
        LEFT JOIN accounts a ON a.user_id = u.id
        LEFT JOIN user_profile up ON up.user_id = u.id
        WHERE (timezone('Asia/Shanghai', u.created_at))::date BETWEEN %s AND %s
          AND COALESCE(a.user_code, up.user_code) IS NOT NULL
          AND trim(COALESCE(a.user_code, up.user_code)) <> ''
        """,
        (start, end),
    ).fetchall()
    codes = [str(r[0]) for r in cohort if r and r[0]]
    registered = len(codes)
    if not codes:
        return [
            {"step": "registered", "label": "新注册", "users": 0},
            {"step": "app_open", "label": "打开 App", "users": 0},
            {"step": "daily_verse_view", "label": "看今日经文", "users": 0},
            {"step": "engaged", "label": "赞或阅读", "users": 0},
            {"step": "habit_hook", "label": "计划/提醒/温习", "users": 0},
        ]

    def _count_with_events(names: tuple[str, ...]) -> int:
        row = conn.execute(
            """
            SELECT count(DISTINCT pe.user_code)
            FROM product_events pe
            WHERE pe.user_code = ANY(%s)
              AND pe.event_name = ANY(%s)
            """,
            (codes, list(names)),
        ).fetchone()
        return int(row[0] or 0) if row else 0

    return [
        {"step": "registered", "label": "新注册", "users": registered},
        {
            "step": "app_open",
            "label": "打开 App",
            "users": _count_with_events(("app_open",)),
        },
        {
            "step": "daily_verse_view",
            "label": "看今日经文",
            "users": _count_with_events(("daily_verse_view",)),
        },
        {
            "step": "engaged",
            "label": "赞或阅读",
            "users": _count_with_events(("daily_verse_like", "reader_open")),
        },
        {
            "step": "habit_hook",
            "label": "计划/提醒/温习",
            "users": _count_with_events(
                ("plan_day_done", "reminder_enable", "warmup_finish")
            ),
        },
    ]


def d1_retention(conn, start: date, end: date) -> dict[str, Any]:
    """
    D1 留存：注册日在 [start, end] 的用户，次日是否有 UV 或产品事件。
    仅统计已过次日的 cohort（注册日 < 今天）。
    """
    from ..time_cn import china_today

    today = china_today()
    ensure_product_events_schema(conn)

    # 有效 cohort 终点：最晚 end，且须早于今天（否则还没到 D1）
    effective_end = min(end, today - __import__("datetime").timedelta(days=1))
    if start > effective_end:
        return {
            "cohort": 0,
            "returned": 0,
            "rate_pct": None,
            "hint": "区间内尚无已过次日的注册用户",
        }

    rows = conn.execute(
        """
        WITH cohort AS (
          SELECT DISTINCT
            COALESCE(a.user_code, up.user_code) AS user_code,
            (timezone('Asia/Shanghai', u.created_at))::date AS reg_day,
            u.id AS user_id
          FROM users u
          LEFT JOIN accounts a ON a.user_id = u.id
          LEFT JOIN user_profile up ON up.user_id = u.id
          WHERE (timezone('Asia/Shanghai', u.created_at))::date BETWEEN %s AND %s
            AND COALESCE(a.user_code, up.user_code) IS NOT NULL
            AND trim(COALESCE(a.user_code, up.user_code)) <> ''
        ),
        returned AS (
          SELECT DISTINCT c.user_code
          FROM cohort c
          WHERE EXISTS (
            SELECT 1 FROM product_events pe
            WHERE pe.user_code = c.user_code
              AND (timezone('Asia/Shanghai', pe.created_at))::date = c.reg_day + 1
          )
          OR EXISTS (
            SELECT 1 FROM daily_active_visitors dav
            WHERE dav.visit_date = c.reg_day + 1
              AND (
                (dav.user_code IS NOT NULL AND dav.user_code = c.user_code)
                OR (dav.user_id IS NOT NULL AND dav.user_id::text = c.user_id::text)
              )
          )
        )
        SELECT
          (SELECT count(*) FROM cohort) AS cohort_n,
          (SELECT count(*) FROM returned) AS returned_n
        """,
        (start, effective_end),
    ).fetchone()
    cohort_n = int(rows[0] or 0) if rows else 0
    returned_n = int(rows[1] or 0) if rows else 0
    rate = round(returned_n / cohort_n * 100, 1) if cohort_n else None
    return {
        "cohort": cohort_n,
        "returned": returned_n,
        "rate_pct": rate,
        "hint": f"注册日 {start.isoformat()}～{effective_end.isoformat()}，次日回访",
    }


def acquisition_source_breakdown(conn, start: date, end: date) -> list[dict]:
    """新注册用户来源拆分：未绑定 / organic·direct / organic·其他 / 有渠道。"""
    rows = conn.execute(
        """
        WITH new_users AS (
          SELECT DISTINCT COALESCE(a.user_code, up.user_code) AS user_code
          FROM users u
          LEFT JOIN accounts a ON a.user_id = u.id
          LEFT JOIN user_profile up ON up.user_id = u.id
          WHERE (timezone('Asia/Shanghai', u.created_at))::date BETWEEN %s AND %s
            AND COALESCE(a.user_code, up.user_code) IS NOT NULL
            AND trim(COALESCE(a.user_code, up.user_code)) <> ''
        )
        SELECT
          CASE
            WHEN acq.user_code IS NULL THEN 'unbound'
            WHEN acq.channel_l1 = 'organic' AND COALESCE(acq.channel_l2, '') IN ('', 'direct')
              THEN 'organic_direct'
            WHEN acq.channel_l1 = 'organic' THEN 'organic_other'
            ELSE 'attributed'
          END AS bucket,
          count(*) AS n
        FROM new_users nu
        LEFT JOIN user_acquisition acq ON acq.user_code = nu.user_code
        GROUP BY 1
        ORDER BY n DESC
        """,
        (start, end),
    ).fetchall()
    labels = {
        "unbound": "未绑定来源",
        "organic_direct": "自然直达",
        "organic_other": "自然·其他",
        "attributed": "已归因渠道",
    }
    by = {str(r[0]): int(r[1] or 0) for r in rows}
    return [
        {"bucket": k, "label": labels[k], "users": by.get(k, 0)}
        for k in ("unbound", "organic_direct", "organic_other", "attributed")
    ]
