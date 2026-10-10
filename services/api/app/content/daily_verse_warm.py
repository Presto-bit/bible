"""每日经文暖场：8800xxxx  persona 池，自适应补缺口，分日爬坡。"""
from __future__ import annotations

import hashlib
import logging
import random
import re
from datetime import date, datetime, timedelta
from typing import Any

from ..auth.account_profile import upsert_user_profile
from ..auth.user_code import uuid_for_code
from ..time_cn import CHINA_TZ, CN_TODAY_SQL, cn_day_sql
from .daily_verse_react import (
    DAILY_VERSE_REACT_PRESETS,
    ensure_daily_verse_react_schema,
    preset_or_none,
)
from .daily_verse_warm_settings import get_warm_settings

logger = logging.getLogger(__name__)

SYNTHETIC_CODE_RE = re.compile(r"^8800\d{4}$")
PERSONA_COUNT = 99
PRESET_IDS = [p["id"] for p in DAILY_VERSE_REACT_PRESETS]
PRESET_WEIGHTS = [
    14 if "pray" in pid or "amen" in pid else 10 if "comfort" in pid or "peace" in pid else 6
    for pid in PRESET_IDS
]

# 99 个自然昵称（与 88000001–88000099 一一对应）
PERSONA_NICKNAMES: tuple[str, ...] = (
    "晨读", "小安", "Grace", "牧心", "清禾", "以诺", "书简", "灵溪", "望恩", "若溪",
    "信实", "如盐", "微光", "守夜", "方舟", "青禾", "安歌", "思恩", "路加", "心怡",
    "云杉", "晓语", "静水深", "慕义", "行路", "光盐", "小葡萄", "橄榄枝", "温言", "星尘",
    "依牧", "明理", "乐仁", "雨嘉", "子谦", "佳恩", "书兰", "心泉", "天路", "小满",
    "知微", "望舒", "和光", "素心", "若兰", "以赛", "书珩", "灵修记", "恩慈", "守望者",
    "林深", "鹿鸣", "清欢", "信望", "小舟", "牧歌", "如鹿", "心光", "安靜", "书墨",
    "微雨", "晨星", "以琳", "路引", "心桥", "温书", "小信", "云雀", "静思", "慕溪",
    "行远", "光语", "小禾", "橄榄树", "温语", "星语", "依光", "明恩", "乐心", "雨桐",
    "子路", "佳音", "书瑶", "心河", "天恩", "小愿", "知恩", "望城", "和音", "素问",
    "若恩", "以心", "书言", "灵粮", "恩语", "守望", "林风", "鹿心", "清语", "信语",
    "小行", "牧语", "如光", "心语", "安语", "书心", "微恩", "晨语", "以光", "路心",
    "心安", "温心", "小光", "云心", "静语", "慕光", "行心", "光心", "小语", "恩心",
    "星心", "依心", "明心", "乐语", "雨心", "子心", "佳心", "书语", "心光语", "天光",
)

assert len(PERSONA_NICKNAMES) >= PERSONA_COUNT


def synthetic_user_code(index: int) -> str:
    """index 1..99 → 88000001..88000099"""
    if index < 1 or index > PERSONA_COUNT:
        raise ValueError("persona_index_out_of_range")
    return f"8800{index:04d}"


def is_synthetic_engagement_user_code(user_code: str | None) -> bool:
    code = (user_code or "").strip()
    return bool(SYNTHETIC_CODE_RE.match(code))


def _smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def _day_jitter(d: date) -> float:
    digest = hashlib.sha256(d.isoformat().encode()).hexdigest()[:8]
    n = int(digest, 16)
    return 0.92 + (n % 161) / 1000.0


def target_cap_for_date(settings: dict[str, Any], d: date) -> int:
    t0_raw = settings.get("t0") or d.isoformat()
    try:
        t0 = date.fromisoformat(str(t0_raw))
    except ValueError:
        t0 = d
    days = max(0, (d - t0).days)
    ramp = max(1, int(settings.get("ramp_days") or 50))
    cap_min = int(settings.get("cap_min") or 10)
    cap_max = min(99, int(settings.get("cap_max") or 100))
    t = days / ramp
    raw = cap_min + (cap_max - cap_min) * _smoothstep(t)
    return min(cap_max, max(cap_min, round(raw * _day_jitter(d))))


def day_progress_fraction(now: datetime) -> float:
    """北京时间当日暖场进度 0..1（6:00 前为 0）。"""
    local = now.astimezone(CHINA_TZ)
    hour = local.hour + local.minute / 60.0 + local.second / 3600.0
    if hour < 6.0:
        return 0.0
    knots = (
        (6.0, 0.0),
        (8.0, 0.14),
        (10.0, 0.26),
        (12.0, 0.38),
        (14.0, 0.48),
        (17.0, 0.62),
        (19.0, 0.76),
        (21.0, 0.90),
        (23.0, 1.0),
    )
    if hour >= knots[-1][0]:
        return 1.0
    for i in range(len(knots) - 1):
        h0, p0 = knots[i]
        h1, p1 = knots[i + 1]
        if h0 <= hour <= h1:
            if h1 == h0:
                return p1
            u = (hour - h0) / (h1 - h0)
            return p0 + (p1 - p0) * u
    return 0.0


def _rng_for(*parts: str) -> random.Random:
    seed = hashlib.sha256(":".join(parts).encode()).hexdigest()
    return random.Random(int(seed[:16], 16))


def _alloc_persona_username(conn, *, code: str, preferred: str) -> str:
    """分配不与其它 user_code 冲突的展示名（accounts.username 全局唯一）。"""
    from ..auth.random_username import is_username_taken

    base = (preferred or "").strip() or f"伙伴{code[-4:]}"
    if not is_username_taken(conn, base, exclude_user_code=code):
        return base
    for suffix in (code[-2:], code[-3:], code[-4:]):
        cand = f"{base}·{suffix}"
        if len(cand) > 24:
            cand = f"伙伴{suffix}"
        if len(cand) >= 2 and not is_username_taken(conn, cand, exclude_user_code=code):
            return cand
    fallback = f"伙伴{code[-4:]}"
    if is_username_taken(conn, fallback, exclude_user_code=code):
        fallback = f"读{code[-4:]}"
    return fallback


def ensure_synthetic_personas(conn) -> int:
    """确保 8800  persona 账号与昵称存在；返回新建/更新数。"""
    touched = 0
    for i in range(1, PERSONA_COUNT + 1):
        code = synthetic_user_code(i)
        name = _alloc_persona_username(conn, code=code, preferred=PERSONA_NICKNAMES[i - 1])
        uid = uuid_for_code(code)
        conn.execute(
            "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
            (uid,),
        )
        conn.execute(
            """
            INSERT INTO accounts (user_code, user_id, username, updated_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (user_code) DO UPDATE SET
              username = EXCLUDED.username,
              user_id = COALESCE(accounts.user_id, EXCLUDED.user_id),
              updated_at = now()
            """,
            (code, uid, name),
        )
        upsert_user_profile(conn, user_id=uid, user_code=code, username=name)
        touched += 1
    return touched


def _today_sql(alias: str) -> str:
    return f"{cn_day_sql(f'{alias}.created_at')} = {CN_TODAY_SQL}"


def _count_distinct_engagement(
    conn,
    *,
    verse_day: int,
    synthetic_only: bool | None = None,
) -> int:
    today_like = _today_sql("daily_verse_like")
    today_react = _today_sql("daily_verse_react")
    synth = ""
    if synthetic_only is True:
        synth = " AND user_code ~ '^8800'"
    elif synthetic_only is False:
        synth = " AND user_code !~ '^8800'"
    row = conn.execute(
        f"""
        SELECT COUNT(*)::int FROM (
          SELECT user_code FROM daily_verse_like
          WHERE verse_day = %s AND {today_like}{synth}
          UNION
          SELECT user_code FROM daily_verse_react
          WHERE verse_day = %s AND {today_react}{synth}
        ) u
        """,
        (verse_day, verse_day),
    ).fetchone()
    return int(row[0]) if row else 0


def _persona_behavior(index: int, d: date) -> tuple[bool, bool]:
    """(like, react) 固定 persona 倾向 + 日级抖动。"""
    r = _rng_for("behavior", synthetic_user_code(index), d.isoformat())
    roll = r.random()
    if roll < 0.62:
        return True, False
    if roll < 0.82:
        return False, True
    return True, True


def _pick_preset(index: int, d: date) -> str:
    r = _rng_for("preset", synthetic_user_code(index), d.isoformat())
    return r.choices(PRESET_IDS, weights=PRESET_WEIGHTS, k=1)[0]


def _random_created_at(now: datetime, rng: random.Random) -> datetime:
    local = now.astimezone(CHINA_TZ)
    back_min = rng.randint(5, 75)
    ts = local - timedelta(minutes=back_min)
    if ts.date() != local.date():
        ts = local - timedelta(minutes=5)
    return ts.astimezone(now.tzinfo) if now.tzinfo else ts


def _insert_like(conn, *, verse_day: int, user_code: str, created_at: datetime) -> bool:
    today_sql = f"{cn_day_sql('created_at')} = {CN_TODAY_SQL}"
    exists = conn.execute(
        f"""
        SELECT 1 FROM daily_verse_like
        WHERE verse_day = %s AND user_code = %s AND {today_sql}
        """,
        (verse_day, user_code),
    ).fetchone()
    if exists:
        return False
    conn.execute(
        "DELETE FROM daily_verse_like WHERE verse_day = %s AND user_code = %s",
        (verse_day, user_code),
    )
    conn.execute(
        """
        INSERT INTO daily_verse_like (verse_day, user_code, created_at)
        VALUES (%s, %s, %s)
        """,
        (verse_day, user_code, created_at),
    )
    return True


def _insert_react(conn, *, verse_day: int, user_code: str, preset_id: str, created_at: datetime) -> bool:
    ensure_daily_verse_react_schema(conn)
    if not preset_or_none(preset_id):
        return False
    today_sql = f"{cn_day_sql('created_at')} = {CN_TODAY_SQL}"
    exists = conn.execute(
        f"""
        SELECT 1 FROM daily_verse_react
        WHERE verse_day = %s AND user_code = %s AND {today_sql}
        """,
        (verse_day, user_code),
    ).fetchone()
    if exists:
        return False
    conn.execute(
        "DELETE FROM daily_verse_react WHERE verse_day = %s AND user_code = %s",
        (verse_day, user_code),
    )
    conn.execute(
        """
        INSERT INTO daily_verse_react
          (verse_day, user_code, preset_id, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (verse_day, user_code, preset_id, created_at, created_at),
    )
    return True


def _inactive_personas_today(conn, verse_day: int, d: date) -> list[int]:
    today_like = _today_sql("l")
    today_react = _today_sql("r")
    rows = conn.execute(
        f"""
        SELECT idx FROM generate_series(1, %s) AS idx
        WHERE NOT EXISTS (
          SELECT 1 FROM daily_verse_like l
          WHERE l.verse_day = %s AND l.user_code = '8800' || lpad(idx::text, 4, '0')
            AND {today_like}
        )
        AND NOT EXISTS (
          SELECT 1 FROM daily_verse_react r
          WHERE r.verse_day = %s AND r.user_code = '8800' || lpad(idx::text, 4, '0')
            AND {today_react}
        )
        """,
        (PERSONA_COUNT, verse_day, verse_day),
    ).fetchall()
    indices = [int(r[0]) for r in rows or []]
    r = _rng_for("shuffle", d.isoformat(), str(verse_day))
    r.shuffle(indices)
    return indices


def run_warm_tick(
    conn,
    *,
    verse_day: int,
    now: datetime | None = None,
    max_writes: int = 8,
) -> dict[str, Any]:
    """执行一次暖场写入（cron 多次调用，分波推进）。"""
    settings = get_warm_settings(conn)
    if not settings.get("enabled"):
        return {"ok": True, "skipped": "disabled"}

    now = now or datetime.now(CHINA_TZ)
    d = now.astimezone(CHINA_TZ).date()
    ensure_synthetic_personas(conn)

    cap = target_cap_for_date(settings, d)
    max_boost = int(settings.get("max_boost") or 20)
    real_u = _count_distinct_engagement(conn, verse_day=verse_day, synthetic_only=False)
    total_u = _count_distinct_engagement(conn, verse_day=verse_day, synthetic_only=None)
    synthetic_u = _count_distinct_engagement(conn, verse_day=verse_day, synthetic_only=True)

    target_total = min(cap, real_u + max_boost)
    synthetic_budget = max(0, target_total - real_u)
    progress = day_progress_fraction(now)
    expected_synthetic = int(synthetic_budget * progress)
    to_add = max(0, expected_synthetic - synthetic_u)
    to_add = min(to_add, max_writes)

    if to_add <= 0:
        return {
            "ok": True,
            "skipped": "caught_up",
            "cap": cap,
            "real_u": real_u,
            "total_u": total_u,
            "synthetic_u": synthetic_u,
            "target_total": target_total,
            "progress": round(progress, 3),
        }

    candidates = _inactive_personas_today(conn, verse_day, d)[: to_add * 3]
    likes_written = reacts_written = personas_used = 0

    for idx in candidates:
        if personas_used >= to_add:
            break
        code = synthetic_user_code(idx)
        do_like, do_react = _persona_behavior(idx, d)
        if not do_like and not do_react:
            do_like = True
        rng = _rng_for("write", code, d.isoformat(), str(verse_day), str(personas_used))
        created_at = _random_created_at(now, rng)
        wrote = False
        if do_like:
            if _insert_like(conn, verse_day=verse_day, user_code=code, created_at=created_at):
                likes_written += 1
                wrote = True
        if do_react:
            preset = _pick_preset(idx, d)
            react_at = created_at + timedelta(seconds=rng.randint(30, 240))
            if _insert_react(
                conn,
                verse_day=verse_day,
                user_code=code,
                preset_id=preset,
                created_at=react_at,
            ):
                reacts_written += 1
                wrote = True
        if wrote:
            personas_used += 1

    return {
        "ok": True,
        "cap": cap,
        "real_u": real_u,
        "total_u": total_u,
        "synthetic_u": synthetic_u,
        "target_total": target_total,
        "synthetic_budget": synthetic_budget,
        "progress": round(progress, 3),
        "personas_added": personas_used,
        "likes_written": likes_written,
        "reacts_written": reacts_written,
    }
