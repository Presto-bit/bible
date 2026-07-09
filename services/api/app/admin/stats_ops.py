"""管理后台数据统计（概览环比、明细、时间范围）。"""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException

from ..db import get_pool
from ..analytics.uv import UV_IDENTITY_SQL
from ..analytics.uv_stats import (
    UV_IDENTITY_A,
    UV_IDENTITY_B,
    uv_converted_sql,
    uv_deduped_count_sql,
    uv_guest_rows_sql,
    uv_login_rows_sql,
    uv_login_users_sql,
    uv_schema_v2,
    uv_series_deduped_sql,
)

STATS_DETAIL_METRICS = frozenset(
    {
        "users",
        "groups",
        "friendships",
        "messages",
        "uv",
        "ai_requests",
        "rag_documents",
    }
)

V2_DETAIL_METRICS = STATS_DETAIL_METRICS - {"rag_documents"}

TITLE_MAP = {
    "users": "注册用户",
    "groups": "读经群",
    "friendships": "好友关系",
    "messages": "群消息",
    "uv": "访问 UV",
    "ai_requests": "AI 请求",
    "rag_documents": "RAG 资料",
}


def resolve_stats_range(
    *,
    preset: str | None = None,
    days: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[date, date, str]:
    today = date.today()
    if date_from and date_to:
        if date_from > date_to:
            raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
        span = (date_to - date_from).days + 1
        if span > 90:
            raise HTTPException(status_code=400, detail="自定义范围最多 90 天")
        return date_from, date_to, "custom"
    if preset == "today":
        return today, today, "today"
    if preset == "30d" or days == 30:
        return today - timedelta(days=29), today, "30d"
    if preset == "7d" or days == 7:
        return today - timedelta(days=6), today, "7d"
    if days and 1 <= days <= 90:
        return today - timedelta(days=days - 1), today, f"{days}d"
    return today - timedelta(days=6), today, "7d"


def _scalar(conn, sql: str, params: tuple = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0] or 0) if row else 0


def _pct_change(today: int, yesterday: int) -> float | None:
    if yesterday > 0:
        return round((today - yesterday) / yesterday * 100, 1)
    if today > 0:
        return 100.0
    return None


def _dod(conn, today_sql: str, yesterday_sql: str, params_today: tuple = (), params_yesterday: tuple = ()) -> dict:
    today = _scalar(conn, today_sql, params_today)
    yesterday = _scalar(conn, yesterday_sql, params_yesterday)
    return {"today": today, "yesterday": yesterday, "pct": _pct_change(today, yesterday)}


def _date_series(conn, sql: str, span_days: int) -> list[dict]:
    rows = conn.execute(sql, (span_days - 1,)).fetchall()
    by_date = {str(r[0]): int(r[1] or 0) for r in rows}
    start = date.today() - timedelta(days=span_days - 1)
    out: list[dict] = []
    for i in range(span_days):
        d = start + timedelta(days=i)
        key = d.isoformat()
        out.append({"date": key, "count": by_date.get(key, 0)})
    return out


def _date_series_between(conn, sql: str, start: date, end: date) -> list[dict]:
    rows = conn.execute(sql, (start, end)).fetchall()
    by_date = {str(r[0]): int(r[1] or 0) for r in rows}
    out: list[dict] = []
    d = start
    while d <= end:
        key = d.isoformat()
        out.append({"date": key, "count": by_date.get(key, 0)})
        d += timedelta(days=1)
    return out


def _insight(label: str, value: str | int, hint: str | None = None) -> dict:
    return {"label": label, "value": value, "hint": hint}


def _section(key: str, title: str, columns: list[dict], items: list[dict]) -> dict:
    return {"key": key, "title": title, "columns": columns, "items": items}


def _col(key: str, label: str) -> dict:
    return {"key": key, "label": label}


def _mask_id(value: str | None, keep: int = 8) -> str | None:
    if not value:
        return None
    if len(value) <= keep + 1:
        return value
    return value[:keep] + "…"


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        "SELECT to_regclass(%s) IS NOT NULL",
        (f"public.{table_name}",),
    ).fetchone()
    return bool(row and row[0])


def _count_active_users(conn, *, span_days: int = 7) -> tuple[int, str | None]:
    """近 N 日活跃用户数；返回 (数量, 可选说明)。"""
    since = span_days - 1
    parts: list[str] = []
    if _table_exists(conn, "reading_log"):
        parts.append(
            f"SELECT user_id FROM reading_log WHERE date >= current_date - {since}"
        )
    if _table_exists(conn, "read_event"):
        parts.append(
            "SELECT user_id FROM read_event "
            f"WHERE deleted = false AND updated_at >= current_date - {since}"
        )
    if parts:
        sql = f"SELECT count(DISTINCT user_id) FROM ({' UNION '.join(parts)}) t"
        return _scalar(conn, sql), None
    if _table_exists(conn, "daily_active_visitors"):
        if uv_schema_v2(conn):
            return _scalar(
                conn,
                uv_deduped_count_sql(where="visit_date >= current_date - %s"),
                (since,),
            ), None
        return _scalar(
            conn,
            """
            SELECT count(DISTINCT visitor_key) FROM daily_active_visitors
            WHERE visit_date >= current_date - %s AND visitor_key LIKE 'u:%%'
            """,
            (since,),
        ), "按 UV 登录用户估算（无 reading_log）"
    return 0, "缺少 reading_log / read_event 表"


def _count_dormant_users(conn, *, span_days: int = 30) -> tuple[int, str | None]:
    """近 N 日无读经记录的用户数。"""
    since = span_days - 1
    has_log = _table_exists(conn, "reading_log")
    has_event = _table_exists(conn, "read_event")
    if not has_log and not has_event:
        return 0, "缺少 reading_log / read_event 表"
    clauses = []
    if has_log:
        clauses.append(
            "NOT EXISTS (SELECT 1 FROM reading_log rl "
            f"WHERE rl.user_id = u.id AND rl.date >= current_date - {since})"
        )
    if has_event:
        clauses.append(
            "NOT EXISTS (SELECT 1 FROM read_event re "
            "WHERE re.user_id = u.id AND re.deleted = false "
            f"AND re.updated_at >= current_date - {since})"
        )
    sql = f"SELECT count(*) FROM users u WHERE {' AND '.join(clauses)}"
    hint = None if has_event else "未含 read_event，仅按 reading_log"
    return _scalar(conn, sql), hint


def _uv_metrics(conn, *, where: str) -> dict[str, int]:
    if uv_schema_v2(conn):
        return {
            "deduped": _scalar(conn, uv_deduped_count_sql(where=where)),
            "guest_rows": _scalar(conn, uv_guest_rows_sql(where=where)),
            "login_rows": _scalar(conn, uv_login_rows_sql(where=where)),
            "login_users": _scalar(conn, uv_login_users_sql(where=where)),
            "converted": _scalar(conn, uv_converted_sql(where=where)),
        }
    login_rows = _scalar(
        conn,
        f"SELECT count(*) FROM daily_active_visitors WHERE {where} "
        "AND visitor_key LIKE 'u:%%'",
    )
    guest_rows = _scalar(
        conn,
        f"SELECT count(*) FROM daily_active_visitors WHERE {where} "
        "AND visitor_key LIKE 'd:%%'",
    )
    return {
        "deduped": login_rows + guest_rows,
        "guest_rows": guest_rows,
        "login_rows": login_rows,
        "login_users": login_rows,
        "converted": 0,
    }


def fetch_admin_stats(*, series_days: int = 7) -> dict:
    span = max(1, min(series_days, 90))
    pool = get_pool()
    with pool.connection() as conn:
        uv_today = _uv_metrics(conn, where="visit_date = current_date")
        uv_7d_where = "visit_date >= current_date - 6"
        if uv_schema_v2(conn):
            uv_7d = _scalar(conn, uv_deduped_count_sql(where=uv_7d_where))
        else:
            uv_7d = _scalar(
                conn,
                f"SELECT count(*) FROM daily_active_visitors WHERE {uv_7d_where}",
            )
        totals = {
            "users": _scalar(conn, "SELECT count(*) FROM users"),
            "accounts": _scalar(conn, "SELECT count(*) FROM accounts"),
            "groups": _scalar(conn, "SELECT count(*) FROM social_group"),
            "group_members": _scalar(conn, "SELECT count(*) FROM group_member"),
            "friendships": _scalar(conn, "SELECT count(*) FROM friendship"),
            "messages_today": _scalar(
                conn,
                "SELECT count(*) FROM group_message WHERE created_at >= current_date",
            ),
            "checkins_today": _scalar(
                conn,
                "SELECT count(*) FROM group_message "
                "WHERE kind = 'checkin' AND created_at >= current_date",
            ),
            "rag_documents": _scalar(conn, "SELECT count(*) FROM bible_documents"),
            "rag_chunks": _scalar(conn, "SELECT count(*) FROM bible_rag_chunks"),
            "rag_failed": _scalar(
                conn,
                "SELECT count(*) FROM bible_documents "
                "WHERE rag_index_error IS NOT NULL "
                "OR status NOT IN ('ready', 'indexed')",
            ),
            "ai_requests_today": _scalar(
                conn,
                "SELECT coalesce(sum(request_count), 0) FROM ai_usage_daily "
                "WHERE usage_date = current_date",
            ),
            "ai_requests_7d": _scalar(
                conn,
                "SELECT coalesce(sum(request_count), 0) FROM ai_usage_daily "
                "WHERE usage_date >= current_date - 6",
            ),
            "uv_today": uv_today["deduped"],
            "uv_today_guest": uv_today["guest_rows"],
            "uv_today_login": uv_today["login_users"],
            "uv_login_visits": uv_today["login_rows"],
            "uv_converted_today": uv_today["converted"],
            "uv_7d": uv_7d,
        }
        dod = {
            "users_new": _dod(
                conn,
                "SELECT count(*) FROM users WHERE created_at >= current_date",
                "SELECT count(*) FROM users WHERE created_at >= current_date - 1 "
                "AND created_at < current_date",
            ),
            "groups_new": _dod(
                conn,
                "SELECT count(*) FROM social_group WHERE created_at >= current_date",
                "SELECT count(*) FROM social_group WHERE created_at >= current_date - 1 "
                "AND created_at < current_date",
            ),
            "friendships_new": _dod(
                conn,
                "SELECT count(*) FROM friendship WHERE created_at >= current_date",
                "SELECT count(*) FROM friendship WHERE created_at >= current_date - 1 "
                "AND created_at < current_date",
            ),
            "messages_today": _dod(
                conn,
                "SELECT count(*) FROM group_message WHERE created_at >= current_date",
                "SELECT count(*) FROM group_message WHERE created_at >= current_date - 1 "
                "AND created_at < current_date",
            ),
            "uv_today": _dod(
                conn,
                uv_deduped_count_sql(where="visit_date = current_date")
                if uv_schema_v2(conn)
                else "SELECT count(*) FROM daily_active_visitors WHERE visit_date = current_date",
                uv_deduped_count_sql(where="visit_date = current_date - 1")
                if uv_schema_v2(conn)
                else "SELECT count(*) FROM daily_active_visitors WHERE visit_date = current_date - 1",
            ),
            "ai_requests_today": _dod(
                conn,
                "SELECT coalesce(sum(request_count), 0) FROM ai_usage_daily "
                "WHERE usage_date = current_date",
                "SELECT coalesce(sum(request_count), 0) FROM ai_usage_daily "
                "WHERE usage_date = current_date - 1",
            ),
            "rag_documents_new": _dod(
                conn,
                "SELECT count(*) FROM bible_documents WHERE created_at >= current_date",
                "SELECT count(*) FROM bible_documents WHERE created_at >= current_date - 1 "
                "AND created_at < current_date",
            ),
        }
        series = {
            "ai_requests": _date_series(
                conn,
                """
                SELECT usage_date::text, coalesce(sum(request_count), 0)
                FROM ai_usage_daily
                WHERE usage_date >= current_date - %s::int
                GROUP BY usage_date ORDER BY usage_date
                """,
                span,
            ),
            "checkins": _date_series(
                conn,
                """
                SELECT created_at::date::text, count(*)
                FROM group_message
                WHERE kind = 'checkin' AND created_at >= current_date - %s::int
                GROUP BY created_at::date ORDER BY created_at::date
                """,
                span,
            ),
            "users": _date_series(
                conn,
                """
                SELECT created_at::date::text, count(*)
                FROM users WHERE created_at >= current_date - %s::int
                GROUP BY created_at::date ORDER BY created_at::date
                """,
                span,
            ),
            "groups": _date_series(
                conn,
                """
                SELECT created_at::date::text, count(*)
                FROM social_group WHERE created_at >= current_date - %s::int
                GROUP BY created_at::date ORDER BY created_at::date
                """,
                span,
            ),
            "group_members": _date_series(
                conn,
                """
                SELECT joined_at::date::text, count(*)
                FROM group_member WHERE joined_at >= current_date - %s::int
                GROUP BY joined_at::date ORDER BY joined_at::date
                """,
                span,
            ),
            "friendships": _date_series(
                conn,
                """
                SELECT created_at::date::text, count(*)
                FROM friendship WHERE created_at >= current_date - %s::int
                GROUP BY created_at::date ORDER BY created_at::date
                """,
                span,
            ),
            "messages": _date_series(
                conn,
                """
                SELECT created_at::date::text, count(*)
                FROM group_message WHERE created_at >= current_date - %s::int
                GROUP BY created_at::date ORDER BY created_at::date
                """,
                span,
            ),
            "rag_documents": _date_series(
                conn,
                """
                SELECT created_at::date::text, count(*)
                FROM bible_documents WHERE created_at >= current_date - %s::int
                GROUP BY created_at::date ORDER BY created_at::date
                """,
                span,
            ),
            "uv": _date_series(
                conn,
                uv_series_deduped_sql()
                if uv_schema_v2(conn)
                else """
                SELECT visit_date::text, count(*)
                FROM daily_active_visitors
                WHERE visit_date >= current_date - %s::int
                GROUP BY visit_date ORDER BY visit_date
                """,
                span,
            ),
        }
    return {"totals": totals, "series": series, "dod": dod}


def _series_for_metric(conn, metric: str, start: date, end: date) -> list[dict]:
    sql_map = {
        "users": (
            "SELECT created_at::date::text, count(*) FROM users "
            "WHERE created_at::date BETWEEN %s AND %s "
            "GROUP BY created_at::date ORDER BY created_at::date"
        ),
        "groups": (
            "SELECT created_at::date::text, count(*) FROM social_group "
            "WHERE created_at::date BETWEEN %s AND %s "
            "GROUP BY created_at::date ORDER BY created_at::date"
        ),
        "friendships": (
            "SELECT created_at::date::text, count(*) FROM friendship "
            "WHERE created_at::date BETWEEN %s AND %s "
            "GROUP BY created_at::date ORDER BY created_at::date"
        ),
        "messages": (
            "SELECT created_at::date::text, count(*) FROM group_message "
            "WHERE created_at::date BETWEEN %s AND %s "
            "GROUP BY created_at::date ORDER BY created_at::date"
        ),
        "uv": (
            f"SELECT visit_date::text, count(DISTINCT {UV_IDENTITY_SQL}) "
            "FROM daily_active_visitors "
            "WHERE visit_date BETWEEN %s AND %s "
            "GROUP BY visit_date ORDER BY visit_date"
            if uv_schema_v2(conn)
            else (
                "SELECT visit_date::text, count(*) FROM daily_active_visitors "
                "WHERE visit_date BETWEEN %s AND %s "
                "GROUP BY visit_date ORDER BY visit_date"
            )
        ),
        "ai_requests": (
            "SELECT usage_date::text, coalesce(sum(request_count), 0) FROM ai_usage_daily "
            "WHERE usage_date BETWEEN %s AND %s "
            "GROUP BY usage_date ORDER BY usage_date"
        ),
        "rag_documents": (
            "SELECT created_at::date::text, count(*) FROM bible_documents "
            "WHERE created_at::date BETWEEN %s AND %s "
            "GROUP BY created_at::date ORDER BY created_at::date"
        ),
    }
    sql = sql_map.get(metric)
    if not sql:
        return []
    return _date_series_between(conn, sql, start, end)


def _fetch_rag_detail(conn, totals: dict, limit: int) -> dict:
    rows = conn.execute(
        """
        SELECT d.id::text, d.title, d.source_type, d.status,
               d.rag_index_at::text, d.rag_index_error,
               (SELECT count(*) FROM bible_rag_chunks c WHERE c.document_id = d.id) AS chunks,
               d.created_at::text
        FROM bible_documents d
        ORDER BY d.updated_at DESC
        LIMIT %s
        """,
        (limit,),
    ).fetchall()
    items = [
        {
            "id": r[0],
            "title": r[1],
            "source_type": r[2],
            "status": r[3],
            "indexed_at": r[4],
            "error": r[5],
            "chunks": int(r[6] or 0),
            "created_at": r[7],
        }
        for r in rows
    ]
    summary = (
        f"{totals['rag_documents']} 篇 · {totals['rag_chunks']} 向量块"
        + (f" · {totals['rag_failed']} 异常" if totals["rag_failed"] else "")
    )
    return {
        "metric": "rag_documents",
        "title": TITLE_MAP["rag_documents"],
        "summary": summary,
        "range": None,
        "series": [],
        "insights": [],
        "sections": [],
        "items": items,
    }


def fetch_admin_stats_detail(
    metric: str,
    *,
    limit: int = 50,
    preset: str | None = None,
    days: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    stats = fetch_admin_stats()
    totals = stats["totals"]
    title = TITLE_MAP.get(metric, metric)

    if metric == "rag_documents":
        pool = get_pool()
        with pool.connection() as conn:
            detail = _fetch_rag_detail(conn, totals, limit)
            detail["series"] = stats["series"].get("rag_documents", [])
            return detail

    start, end, range_preset = resolve_stats_range(
        preset=preset, days=days, date_from=date_from, date_to=date_to,
    )
    range_info = {"from": start.isoformat(), "to": end.isoformat(), "preset": range_preset}

    pool = get_pool()
    with pool.connection() as conn:
        series = _series_for_metric(conn, metric, start, end)
        insights: list[dict] = []
        sections: list[dict] = []
        items: list[dict] = []
        summary = ""

        if metric == "users":
            active_7d, active_hint = _count_active_users(conn, span_days=7)
            dormant_30d, dormant_hint = _count_dormant_users(conn, span_days=30)
            with_account = _scalar(
                conn,
                "SELECT count(DISTINCT user_id) FROM accounts",
            )
            insights = [
                _insight("近 7 日活跃", active_7d, active_hint or "有读经记录"),
                _insight("沉睡用户", dormant_30d, dormant_hint or "30 日无读经"),
                _insight("已绑账号", with_account, f"占 {totals['users']} 人"),
            ]
            rows = conn.execute(
                """
                SELECT u.id::text, u.handle, u.display_name, u.created_at::text,
                       EXISTS(SELECT 1 FROM accounts a WHERE a.user_id = u.id) AS has_account
                FROM users u
                WHERE u.created_at::date BETWEEN %s AND %s
                ORDER BY u.created_at DESC
                LIMIT %s
                """,
                (start, end, limit),
            ).fetchall()
            items = [
                {
                    "id": _mask_id(r[0]),
                    "handle": r[1],
                    "display_name": r[2],
                    "created_at": r[3],
                    "has_account": bool(r[4]),
                }
                for r in rows
            ]
            sections.append(
                _section(
                    "recent_users",
                    "区间内新注册用户",
                    [_col("handle", "用户名"), _col("display_name", "昵称"), _col("created_at", "注册时间"), _col("has_account", "已绑账号")],
                    items,
                )
            )
            summary = f"累计 {totals['users']} 人 · 区间新增 {sum(p['count'] for p in series)}"

        elif metric == "groups":
            rows_top = conn.execute(
                """
                SELECT g.name,
                       count(*) FILTER (WHERE m.kind = 'checkin'
                         AND m.created_at::date = current_date) AS checkins_today,
                       (SELECT count(*) FROM group_member gm WHERE gm.group_id = g.id) AS members
                FROM social_group g
                LEFT JOIN group_message m ON m.group_id = g.id
                GROUP BY g.id, g.name
                HAVING (SELECT count(*) FROM group_member gm WHERE gm.group_id = g.id) > 0
                ORDER BY checkins_today DESC, members DESC
                LIMIT 10
                """,
            ).fetchall()
            top_items = []
            for r in rows_top:
                members = int(r[2] or 0)
                checkins = int(r[1] or 0)
                rate = round(checkins / members * 100, 1) if members else 0
                top_items.append({
                    "name": r[0],
                    "checkins_today": checkins,
                    "members": members,
                    "checkin_rate": f"{rate}%",
                })
            rows_active = conn.execute(
                """
                SELECT g.name, count(m.id) AS msg_count
                FROM social_group g
                JOIN group_message m ON m.group_id = g.id
                WHERE m.created_at::date BETWEEN %s AND %s
                GROUP BY g.id, g.name
                ORDER BY msg_count DESC
                LIMIT %s
                """,
                (start, end, min(limit, 10)),
            ).fetchall()
            active_items = [{"name": r[0], "messages": int(r[1])} for r in rows_active]
            zombie_rows = conn.execute(
                """
                SELECT g.name,
                       (SELECT count(*) FROM group_member gm WHERE gm.group_id = g.id) AS members,
                       coalesce(max(m.created_at)::date::text, '—') AS last_msg
                FROM social_group g
                LEFT JOIN group_message m ON m.group_id = g.id
                GROUP BY g.id, g.name
                HAVING coalesce(max(m.created_at), g.created_at) < current_date - 29
                    OR (SELECT count(*) FROM group_member gm WHERE gm.group_id = g.id) = 0
                ORDER BY members ASC, g.created_at ASC
                LIMIT %s
                """,
                (min(limit, 20),),
            ).fetchall()
            zombie_items = [
                {"name": r[0], "members": int(r[1] or 0), "last_message": r[2]}
                for r in zombie_rows
            ]
            insights = [
                _insight("累计群数", totals["groups"]),
                _insight("累计成员", totals["group_members"]),
                _insight("今日打卡群", len([x for x in top_items if x["checkins_today"] > 0])),
            ]
            sections = [
                _section(
                    "top_checkin",
                    "今日打卡率 Top",
                    [_col("name", "群名"), _col("checkins_today", "今日打卡"), _col("members", "成员"), _col("checkin_rate", "打卡率")],
                    top_items,
                ),
                _section(
                    "active_groups",
                    f"区间活跃群（{range_preset}）",
                    [_col("name", "群名"), _col("messages", "消息数")],
                    active_items,
                ),
                _section(
                    "zombie_groups",
                    "空群 / 30 日无消息",
                    [_col("name", "群名"), _col("members", "成员"), _col("last_message", "最近消息")],
                    zombie_items,
                ),
            ]
            summary = f"累计 {totals['groups']} 群 · 区间新建 {sum(p['count'] for p in series)}"

        elif metric == "friendships":
            total_rows = totals["friendships"]
            mutual_pairs = _scalar(
                conn,
                """
                SELECT count(*) FROM friendship f1
                WHERE EXISTS (
                  SELECT 1 FROM friendship f2
                  WHERE f2.user_id = f1.friend_id AND f2.friend_id = f1.user_id
                ) AND f1.user_id < f1.friend_id
                """,
            )
            one_way = max(0, total_rows - mutual_pairs * 2)
            avg_friends = conn.execute(
                "SELECT round(avg(cnt)::numeric, 1) FROM ("
                "SELECT count(*) AS cnt FROM friendship GROUP BY user_id) t"
            ).fetchone()
            avg_val = float(avg_friends[0]) if avg_friends and avg_friends[0] is not None else 0
            insights = [
                _insight("关系行数", total_rows),
                _insight("互关对数", mutual_pairs),
                _insight("单向关系", one_way),
                _insight("人均好友", avg_val),
            ]
            dist_rows = conn.execute(
                """
                SELECT friend_count, count(*) AS users FROM (
                  SELECT user_id, count(*) AS friend_count FROM friendship GROUP BY user_id
                ) t GROUP BY friend_count ORDER BY friend_count
                LIMIT 15
                """,
            ).fetchall()
            dist_items = [{"friends": int(r[0]), "users": int(r[1])} for r in dist_rows]
            recent_rows = conn.execute(
                """
                SELECT user_id::text, friend_id::text, created_at::text
                FROM friendship
                WHERE created_at::date BETWEEN %s AND %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (start, end, limit),
            ).fetchall()
            items = [
                {"user": _mask_id(r[0]), "friend": _mask_id(r[1]), "created_at": r[2]}
                for r in recent_rows
            ]
            sections = [
                _section(
                    "friend_dist",
                    "好友数分布",
                    [_col("friends", "好友数"), _col("users", "用户数")],
                    dist_items,
                ),
                _section(
                    "recent",
                    "区间新增关系",
                    [_col("user", "用户"), _col("friend", "好友"), _col("created_at", "时间")],
                    items,
                ),
            ]
            summary = f"累计 {total_rows} 条 · 区间新增 {sum(p['count'] for p in series)}"

        elif metric == "messages":
            total_in_range = _scalar(
                conn,
                "SELECT count(*) FROM group_message WHERE created_at::date BETWEEN %s AND %s",
                (start, end),
            )
            checkins = _scalar(
                conn,
                "SELECT count(*) FROM group_message WHERE kind = 'checkin' "
                "AND created_at::date BETWEEN %s AND %s",
                (start, end),
            )
            tasks = _scalar(
                conn,
                "SELECT count(*) FROM group_message WHERE kind = 'task' "
                "AND created_at::date BETWEEN %s AND %s",
                (start, end),
            )
            checkin_pct = round(checkins / total_in_range * 100, 1) if total_in_range else 0
            insights = [
                _insight("区间消息", total_in_range),
                _insight("打卡", checkins, f"占 {checkin_pct}%"),
                _insight("任务", tasks),
            ]
            group_rows = conn.execute(
                """
                SELECT g.name, count(*) AS total,
                       count(*) FILTER (WHERE m.kind = 'checkin') AS checkins,
                       count(*) FILTER (WHERE m.kind = 'task') AS tasks
                FROM group_message m
                JOIN social_group g ON g.id = m.group_id
                WHERE m.created_at::date BETWEEN %s AND %s
                GROUP BY g.id, g.name
                ORDER BY total DESC
                LIMIT %s
                """,
                (start, end, min(limit, 20)),
            ).fetchall()
            group_items = [
                {"group": r[0], "total": int(r[1]), "checkins": int(r[2]), "tasks": int(r[3])}
                for r in group_rows
            ]
            hour_rows = conn.execute(
                """
                SELECT extract(hour from created_at)::int AS hour, count(*) AS cnt
                FROM group_message
                WHERE created_at::date BETWEEN %s AND %s
                GROUP BY hour ORDER BY hour
                """,
                (start, end),
            ).fetchall()
            hour_items = [{"hour": f"{int(r[0]):02d}:00", "count": int(r[1])} for r in hour_rows]
            recent_rows = conn.execute(
                """
                SELECT g.name, m.kind, m.ref, m.created_at::text
                FROM group_message m
                JOIN social_group g ON g.id = m.group_id
                WHERE m.created_at::date BETWEEN %s AND %s
                ORDER BY m.created_at DESC
                LIMIT %s
                """,
                (start, end, limit),
            ).fetchall()
            items = [{"group": r[0], "kind": r[1], "ref": r[2], "created_at": r[3]} for r in recent_rows]
            sections = [
                _section(
                    "by_group",
                    "按群聚合",
                    [_col("group", "群"), _col("total", "合计"), _col("checkins", "打卡"), _col("tasks", "任务")],
                    group_items,
                ),
                _section(
                    "hourly",
                    "发送时段分布",
                    [_col("hour", "时段"), _col("count", "消息数")],
                    hour_items,
                ),
                _section(
                    "recent",
                    "最近消息",
                    [_col("group", "群"), _col("kind", "类型"), _col("ref", "经文"), _col("created_at", "时间")],
                    items,
                ),
            ]
            summary = f"今日 {totals['messages_today']} · 打卡 {totals['checkins_today']}"

        elif metric == "uv":
            range_where = "visit_date BETWEEN %s AND %s"
            range_args = (start, end)
            if uv_schema_v2(conn):
                deduped = _scalar(
                    conn, uv_deduped_count_sql(where=range_where), range_args,
                )
                guest_uv = _scalar(
                    conn, uv_guest_rows_sql(where=range_where), range_args,
                )
                login_users = _scalar(
                    conn, uv_login_users_sql(where=range_where), range_args,
                )
                login_visits = _scalar(
                    conn, uv_login_rows_sql(where=range_where), range_args,
                )
                converted = _scalar(
                    conn, uv_converted_sql(where=range_where), range_args,
                )
                identity = UV_IDENTITY_A
                identity_b = UV_IDENTITY_B
                d1_num = _scalar(
                    conn,
                    f"""
                    SELECT count(DISTINCT {identity}) FROM daily_active_visitors a
                    JOIN daily_active_visitors b
                      ON {identity} = {identity_b}
                     AND b.visit_date = a.visit_date + 1
                    WHERE a.visit_date BETWEEN %s AND %s - 1
                    """,
                    range_args,
                )
                d1_den = _scalar(
                    conn,
                    f"""
                    SELECT count(DISTINCT {UV_IDENTITY_SQL}) FROM daily_active_visitors
                    WHERE visit_date BETWEEN %s AND %s - 1
                    """,
                    range_args,
                )
                d7_num = _scalar(
                    conn,
                    f"""
                    SELECT count(DISTINCT {identity}) FROM daily_active_visitors a
                    JOIN daily_active_visitors b
                      ON {identity} = {identity_b}
                     AND b.visit_date = a.visit_date + 7
                    WHERE a.visit_date BETWEEN %s AND %s - 7
                    """,
                    range_args,
                )
                d7_den = _scalar(
                    conn,
                    f"""
                    SELECT count(DISTINCT {UV_IDENTITY_SQL}) FROM daily_active_visitors
                    WHERE visit_date BETWEEN %s AND %s - 7
                    """,
                    range_args,
                )
                rows = conn.execute(
                    """
                    SELECT device_fingerprint, user_id::text, visit_date::text,
                           created_at::text, user_bound_at::text
                    FROM daily_active_visitors
                    WHERE visit_date BETWEEN %s AND %s
                    ORDER BY visit_date DESC, created_at DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                ).fetchall()
                items = []
                for r in rows:
                    device, uid, vdate, created, bound = r
                    converted_today = bool(
                        uid and bound and str(bound)[:10] == vdate
                    )
                    items.append({
                        "type": "登录" if uid else "游客",
                        "device": _mask_id(device, 10),
                        "user": _mask_id(uid) if uid else "—",
                        "converted": "是" if converted_today else "—",
                        "visit_date": vdate,
                        "created_at": created,
                    })
                visitor_cols = [
                    _col("type", "类型"),
                    _col("device", "设备"),
                    _col("user", "用户"),
                    _col("converted", "当日转化"),
                    _col("visit_date", "日期"),
                    _col("created_at", "时间"),
                ]
            else:
                deduped = _scalar(
                    conn,
                    "SELECT count(*) FROM daily_active_visitors WHERE visit_date BETWEEN %s AND %s",
                    range_args,
                )
                login_uv = _scalar(
                    conn,
                    """
                    SELECT count(*) FROM daily_active_visitors
                    WHERE visit_date BETWEEN %s AND %s AND visitor_key LIKE 'u:%%'
                    """,
                    range_args,
                )
                guest_uv = _scalar(
                    conn,
                    """
                    SELECT count(*) FROM daily_active_visitors
                    WHERE visit_date BETWEEN %s AND %s AND visitor_key LIKE 'd:%%'
                    """,
                    range_args,
                )
                login_users = login_uv
                login_visits = login_uv
                converted = 0
                d1_num = _scalar(
                    conn,
                    """
                    SELECT count(DISTINCT a.visitor_key) FROM daily_active_visitors a
                    JOIN daily_active_visitors b
                      ON a.visitor_key = b.visitor_key AND b.visit_date = a.visit_date + 1
                    WHERE a.visit_date BETWEEN %s AND %s - 1
                    """,
                    range_args,
                )
                d1_den = _scalar(
                    conn,
                    "SELECT count(DISTINCT visitor_key) FROM daily_active_visitors "
                    "WHERE visit_date BETWEEN %s AND %s - 1",
                    range_args,
                )
                d7_num = _scalar(
                    conn,
                    """
                    SELECT count(DISTINCT a.visitor_key) FROM daily_active_visitors a
                    JOIN daily_active_visitors b
                      ON a.visitor_key = b.visitor_key AND b.visit_date = a.visit_date + 7
                    WHERE a.visit_date BETWEEN %s AND %s - 7
                    """,
                    range_args,
                )
                d7_den = _scalar(
                    conn,
                    "SELECT count(DISTINCT visitor_key) FROM daily_active_visitors "
                    "WHERE visit_date BETWEEN %s AND %s - 7",
                    range_args,
                )
                rows = conn.execute(
                    """
                    SELECT visitor_key, visit_date::text, created_at::text
                    FROM daily_active_visitors
                    WHERE visit_date BETWEEN %s AND %s
                    ORDER BY visit_date DESC, created_at DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                ).fetchall()
                items = [
                    {
                        "type": "用户" if r[0] and r[0].startswith("u:") else "设备",
                        "visitor_key": (r[0][2:10] + "…") if r[0] and len(r[0]) > 12 else r[0],
                        "visit_date": r[1],
                        "created_at": r[2],
                    }
                    for r in rows
                ]
                visitor_cols = [
                    _col("type", "类型"),
                    _col("visitor_key", "标识"),
                    _col("visit_date", "日期"),
                    _col("created_at", "时间"),
                ]
            d1 = round(d1_num / d1_den * 100, 1) if d1_den else None
            d7 = round(d7_num / d7_den * 100, 1) if d7_den else None
            guest_pct = round(guest_uv / deduped * 100, 1) if deduped else 0
            convert_pct = round(converted / guest_uv * 100, 1) if guest_uv and converted else 0
            insights = [
                _insight("去重 UV", deduped, "COALESCE(用户, 设备)"),
                _insight("游客设备", guest_uv, f"占 {guest_pct}%"),
                _insight("登录用户", login_users, f"访问 {login_visits} 次"),
                _insight("当日转化", converted, f"游客→登录 {convert_pct}%" if converted else None),
                _insight("次日留存", f"{d1}%" if d1 is not None else "—"),
                _insight("7 日留存", f"{d7}%" if d7 is not None else "—"),
            ]
            sections.append(
                _section("visitors", "访客明细（脱敏）", visitor_cols, items)
            )
            summary = (
                f"今日去重 {totals['uv_today']} · 区间去重 {deduped} · "
                f"转化 {totals.get('uv_converted_today', converted)}"
            )

        elif metric == "ai_requests":
            has_log = conn.execute(
                "SELECT to_regclass('public.ai_request_log') IS NOT NULL"
            ).fetchone()[0]
            if has_log:
                total_req = _scalar(
                    conn,
                    "SELECT count(*) FROM ai_request_log WHERE created_at::date BETWEEN %s AND %s",
                    (start, end),
                )
                ok_cnt = _scalar(
                    conn,
                    "SELECT count(*) FROM ai_request_log WHERE status = 'ok' "
                    "AND created_at::date BETWEEN %s AND %s",
                    (start, end),
                )
                err_cnt = total_req - ok_cnt
                ok_pct = round(ok_cnt / total_req * 100, 1) if total_req else 0
                insights = [
                    _insight("区间请求", total_req),
                    _insight("成功", ok_cnt, f"{ok_pct}%"),
                    _insight("失败", err_cnt),
                ]
                scene_rows = conn.execute(
                    """
                    SELECT coalesce(scene, 'unknown') AS scene, count(*) AS cnt
                    FROM ai_request_log
                    WHERE created_at::date BETWEEN %s AND %s
                    GROUP BY scene ORDER BY cnt DESC LIMIT 12
                    """,
                    (start, end),
                ).fetchall()
                scene_items = [{"scene": r[0], "count": int(r[1])} for r in scene_rows]
                hour_rows = conn.execute(
                    """
                    SELECT extract(hour from created_at)::int AS hour, count(*) AS cnt
                    FROM ai_request_log
                    WHERE created_at::date BETWEEN %s AND %s
                    GROUP BY hour ORDER BY hour
                    """,
                    (start, end),
                ).fetchall()
                hour_items = [{"hour": f"{int(r[0]):02d}:00", "count": int(r[1])} for r in hour_rows]
                top_rows = conn.execute(
                    """
                    SELECT coalesce(user_id::text, '游客') AS uid, count(*) AS cnt
                    FROM ai_request_log
                    WHERE created_at::date BETWEEN %s AND %s
                    GROUP BY user_id
                    ORDER BY cnt DESC
                    LIMIT 10
                    """,
                    (start, end),
                ).fetchall()
                top_items = [
                    {
                        "user": _mask_id(r[0]) if r[0] != "游客" else "游客",
                        "requests": int(r[1]),
                    }
                    for r in top_rows
                ]
                recent_rows = conn.execute(
                    """
                    SELECT coalesce(scene, '—'), mode, surface, status, created_at::text
                    FROM ai_request_log
                    WHERE created_at::date BETWEEN %s AND %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                ).fetchall()
                items = [
                    {"scene": r[0], "mode": r[1], "surface": r[2], "status": r[3], "created_at": r[4]}
                    for r in recent_rows
                ]
                sections = [
                    _section(
                        "by_scene",
                        "按场景",
                        [_col("scene", "场景"), _col("count", "请求数")],
                        scene_items,
                    ),
                    _section(
                        "hourly",
                        "时段分布",
                        [_col("hour", "时段"), _col("count", "请求数")],
                        hour_items,
                    ),
                    _section(
                        "top_users",
                        "Top 用户（脱敏）",
                        [_col("user", "用户"), _col("requests", "请求数")],
                        top_items,
                    ),
                    _section(
                        "recent",
                        "最近请求",
                        [_col("scene", "场景"), _col("mode", "模式"), _col("surface", "入口"), _col("status", "状态"), _col("created_at", "时间")],
                        items,
                    ),
                ]
                summary = f"今日 {totals['ai_requests_today']} 次 · 区间 {total_req} 次"
            else:
                insights = [_insight("提示", "需执行 017_ai_request_log 迁移")]
                rows = conn.execute(
                    """
                    SELECT coalesce(a.user_id::text, ''), gd.device_fingerprint,
                           a.request_count, a.usage_date::text
                    FROM ai_usage_daily a
                    LEFT JOIN guest_devices gd ON gd.guest_id = a.guest_id
                    WHERE a.usage_date BETWEEN %s AND %s
                    ORDER BY a.usage_date DESC, a.request_count DESC
                    LIMIT %s
                    """,
                    (start, end, limit),
                ).fetchall()
                items = [
                    {
                        "user_id": _mask_id(r[0]) or "—",
                        "device": (r[1][:12] + "…") if r[1] and len(r[1]) > 14 else r[1],
                        "request_count": int(r[2] or 0),
                        "usage_date": r[3],
                    }
                    for r in rows
                ]
                sections.append(
                    _section(
                        "daily_usage",
                        "日汇总（迁移后可见场景明细）",
                        [_col("usage_date", "日期"), _col("request_count", "请求数"), _col("user_id", "用户"), _col("device", "设备")],
                        items,
                    )
                )
                summary = f"今日 {totals['ai_requests_today']} 次 · 近 7 日 {totals['ai_requests_7d']} 次"

        else:
            raise HTTPException(status_code=404, detail="未知指标")

    return {
        "metric": metric,
        "title": title,
        "summary": summary,
        "range": range_info,
        "series": series,
        "insights": insights,
        "sections": sections,
        "items": items,
    }
