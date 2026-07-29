"""每日经文回应：白名单 emoji / 短语（不可自由输入）。"""
from __future__ import annotations

from typing import Any

# id 必须稳定；客户端与服务端共用同一套
DAILY_VERSE_REACT_PRESETS: list[dict[str, str]] = [
    # emoji
    {"id": "emoji:pray", "kind": "emoji", "emoji": "🙏", "label": "祷告"},
    {"id": "emoji:heart", "kind": "emoji", "emoji": "❤️", "label": "喜爱"},
    {"id": "emoji:dove", "kind": "emoji", "emoji": "🕊️", "label": "平安"},
    {"id": "emoji:sparkle", "kind": "emoji", "emoji": "✨", "label": "光照"},
    {"id": "emoji:sunrise", "kind": "emoji", "emoji": "🌅", "label": "盼望"},
    {"id": "emoji:strong", "kind": "emoji", "emoji": "💪", "label": "力量"},
    {"id": "emoji:hands", "kind": "emoji", "emoji": "🤲", "label": "仰望"},
    {"id": "emoji:smile", "kind": "emoji", "emoji": "😊", "label": "喜乐"},
    {"id": "emoji:tear", "kind": "emoji", "emoji": "😢", "label": "被触动"},
    {"id": "emoji:fire", "kind": "emoji", "emoji": "🔥", "label": "火热"},
    # phrase
    {"id": "phrase:amen", "kind": "phrase", "emoji": "🙏", "label": "阿们"},
    {"id": "phrase:comfort", "kind": "phrase", "emoji": "🕊️", "label": "今日得安慰"},
    {"id": "phrase:about_me", "kind": "phrase", "emoji": "✨", "label": "与我有关"},
    {"id": "phrase:rely", "kind": "phrase", "emoji": "🤲", "label": "提醒我倚靠神"},
    {"id": "phrase:strength", "kind": "phrase", "emoji": "💪", "label": "加添力量"},
    {"id": "phrase:peace", "kind": "phrase", "emoji": "🌅", "label": "心里平安"},
    {"id": "phrase:thanks", "kind": "phrase", "emoji": "❤️", "label": "感谢主"},
    {"id": "phrase:obey", "kind": "phrase", "emoji": "🔥", "label": "愿意顺服"},
]

_PRESET_BY_ID = {p["id"]: p for p in DAILY_VERSE_REACT_PRESETS}


def ensure_daily_verse_react_schema(conn) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_verse_react (
          verse_day INT NOT NULL,
          user_code TEXT NOT NULL,
          preset_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (verse_day, user_code)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS daily_verse_react_day_created_idx
          ON daily_verse_react (verse_day, created_at DESC)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS daily_verse_react_day_preset_idx
          ON daily_verse_react (verse_day, preset_id)
        """
    )


def preset_or_none(preset_id: str | None) -> dict[str, str] | None:
    if not preset_id:
        return None
    return _PRESET_BY_ID.get((preset_id or "").strip())


def serialize_preset(preset_id: str | None) -> dict[str, str] | None:
    p = preset_or_none(preset_id)
    if not p:
        return None
    return {
        "id": p["id"],
        "kind": p["kind"],
        "emoji": p["emoji"],
        "label": p["label"],
    }


def list_presets_payload() -> dict[str, Any]:
    emojis = [serialize_preset(p["id"]) for p in DAILY_VERSE_REACT_PRESETS if p["kind"] == "emoji"]
    phrases = [serialize_preset(p["id"]) for p in DAILY_VERSE_REACT_PRESETS if p["kind"] == "phrase"]
    return {
        "emojis": [x for x in emojis if x],
        "phrases": [x for x in phrases if x],
    }


def react_engagement(conn, verse_day: int, user_code: str | None) -> dict[str, Any]:
    ensure_daily_verse_react_schema(conn)
    count_row = conn.execute(
        "SELECT COUNT(*)::int FROM daily_verse_react WHERE verse_day = %s",
        (verse_day,),
    ).fetchone()
    reacts_count = int(count_row[0]) if count_row else 0

    my_react = None
    if user_code:
        mine = conn.execute(
            """
            SELECT preset_id FROM daily_verse_react
            WHERE verse_day = %s AND user_code = %s
            LIMIT 1
            """,
            (verse_day, user_code),
        ).fetchone()
        if mine:
            my_react = serialize_preset(mine[0])

    top_rows = conn.execute(
        """
        SELECT preset_id, COUNT(*)::int AS c
        FROM daily_verse_react
        WHERE verse_day = %s
        GROUP BY preset_id
        ORDER BY c DESC, preset_id ASC
        LIMIT 5
        """,
        (verse_day,),
    ).fetchall()
    top_presets = []
    for row in top_rows or []:
        preset = serialize_preset(row[0])
        if not preset:
            continue
        top_presets.append({**preset, "count": int(row[1])})

    return {
        "reacts_count": reacts_count,
        "my_react": my_react,
        "top_presets": top_presets,
    }


def upsert_react(conn, *, verse_day: int, user_code: str, preset_id: str) -> dict[str, Any]:
    ensure_daily_verse_react_schema(conn)
    preset = preset_or_none(preset_id)
    if not preset:
        raise ValueError("invalid_preset")

    existing = conn.execute(
        """
        SELECT preset_id FROM daily_verse_react
        WHERE verse_day = %s AND user_code = %s
        LIMIT 1
        """,
        (verse_day, user_code),
    ).fetchone()

    if existing and existing[0] == preset["id"]:
        conn.execute(
            "DELETE FROM daily_verse_react WHERE verse_day = %s AND user_code = %s",
            (verse_day, user_code),
        )
        removed = True
    else:
        conn.execute(
            """
            INSERT INTO daily_verse_react (verse_day, user_code, preset_id, created_at, updated_at)
            VALUES (%s, %s, %s, now(), now())
            ON CONFLICT (verse_day, user_code) DO UPDATE SET
              preset_id = EXCLUDED.preset_id,
              updated_at = now()
            """,
            (verse_day, user_code, preset["id"]),
        )
        removed = False

    stats = react_engagement(conn, verse_day, user_code)
    return {**stats, "removed": removed}


def list_react_feed(conn, *, verse_day: int, limit: int = 40) -> list[dict[str, Any]]:
    ensure_daily_verse_react_schema(conn)
    lim = max(1, min(int(limit or 40), 80))
    rows = conn.execute(
        """
        SELECT
          r.user_code,
          r.preset_id,
          r.created_at,
          COALESCE(
            nullif(trim(up.username), ''),
            nullif(trim(a.user_code), ''),
            r.user_code
          ) AS display_name
        FROM daily_verse_react r
        LEFT JOIN accounts a ON a.user_code = r.user_code
        LEFT JOIN user_profile up ON up.user_id = a.user_id
        WHERE r.verse_day = %s
        ORDER BY r.created_at DESC
        LIMIT %s
        """,
        (verse_day, lim),
    ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows or []:
        preset = serialize_preset(row[1])
        if not preset:
            continue
        created = row[2]
        items.append(
            {
                "user_code": row[0],
                "display_name": (row[3] or row[0] or "读经伙伴"),
                "preset": preset,
                "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
            }
        )
    return items
