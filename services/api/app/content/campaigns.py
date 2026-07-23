"""群定向活动运营 API（docs/CAMPAIGN-OPS.md · 成熟 MVP）。"""
from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..auth.session import get_current_user, try_get_current_user
from ..db import get_pool
from ..social import access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content/campaigns", tags=["campaigns"])

CHINA_TZ = ZoneInfo("Asia/Shanghai")
_ID_RE = re.compile(r"^camp_[a-z0-9]{10,20}$")

TEMPLATES: dict[str, dict[str, Any]] = {
    "multi_day": {
        "id": "multi_day",
        "name": "N 日阅读",
        "domain": "A",
        "tag": "阅读",
        "blurb": "按天贴资料，引导成员阅读与讨论",
        "landing": {
            "title": "",
            "body": "一起按天读完这份材料。",
            "features": {"likes": True, "comments": True, "rsvp": False, "prayer": False, "dayUnlock": "all"},
            "days": [
                {"day": 1, "title": "第 1 天", "body": "", "verseRef": "", "discussionHint": ""},
                {"day": 2, "title": "第 2 天", "body": "", "verseRef": "", "discussionHint": ""},
                {"day": 3, "title": "第 3 天", "body": "", "verseRef": "", "discussionHint": ""},
            ],
            "primaryCta": {"label": "开始今日阅读", "href": ""},
        },
    },
    "gathering": {
        "id": "gathering",
        "name": "聚会通知",
        "domain": "C",
        "tag": "聚会",
        "blurb": "时间地点 + 出席确认",
        "landing": {
            "title": "",
            "body": "欢迎参加本次聚会。",
            "features": {"likes": True, "comments": False, "rsvp": True, "prayer": False, "countdown": True, "dayUnlock": "all"},
            "schedule": {"startsAt": "", "endsAt": "", "location": "", "onlineNote": ""},
            "days": [],
            "primaryCta": {"label": "查看详情", "href": ""},
        },
    },
    "prayer_drive": {
        "id": "prayer_drive",
        "name": "代祷召集",
        "domain": "B",
        "tag": "代祷",
        "blurb": "收集代祷意向（默认仅管理可见明细）",
        "landing": {
            "title": "",
            "body": "请留下你的代祷意向，我们一起祷告。",
            "features": {
                "likes": True,
                "comments": False,
                "rsvp": False,
                "prayer": True,
                "prayerPrivate": True,
                "dayUnlock": "all",
            },
            "days": [],
            "primaryCta": {"label": "提交代祷", "href": ""},
        },
    },
    "promo": {
        "id": "promo",
        "name": "轻动员",
        "domain": "H",
        "tag": "动员",
        "blurb": "一句话号召 + 行动按钮",
        "landing": {
            "title": "",
            "body": "",
            "features": {"likes": True, "comments": False, "rsvp": False, "prayer": False, "dayUnlock": "all"},
            "days": [],
            "primaryCta": {"label": "了解更多", "href": "/"},
        },
    },
    "verse_day": {
        "id": "verse_day",
        "name": "经文日",
        "domain": "A",
        "tag": "经文",
        "blurb": "单日经文 + 短文 + 打开圣经",
        "landing": {
            "title": "",
            "body": "",
            "features": {"likes": True, "comments": True, "rsvp": False, "prayer": False, "dayUnlock": "all"},
            "days": [
                {"day": 1, "title": "今日经文", "body": "", "verseRef": "", "discussionHint": ""},
            ],
            "primaryCta": {"label": "打开圣经", "href": "/reader"},
        },
    },
    "memory": {
        "id": "memory",
        "name": "背诵挑战",
        "domain": "A",
        "tag": "背诵",
        "blurb": "多节经文清单，勾选「已记住」",
        "landing": {
            "title": "",
            "body": "逐节背诵，勾选已记住的经文。",
            "features": {"likes": True, "comments": False, "rsvp": False, "prayer": False, "dayUnlock": "all"},
            "days": [
                {"day": 1, "title": "经文 1", "body": "", "verseRef": "", "discussionHint": ""},
                {"day": 2, "title": "经文 2", "body": "", "verseRef": "", "discussionHint": ""},
                {"day": 3, "title": "经文 3", "body": "", "verseRef": "", "discussionHint": ""},
            ],
            "primaryCta": {"label": "开始背诵", "href": ""},
        },
    },
    "welcome": {
        "id": "welcome",
        "name": "迎新",
        "domain": "E",
        "tag": "迎新",
        "blurb": "欢迎新人 + 提问箱（仅管理可见）+ 可链到群",
        "landing": {
            "title": "欢迎加入",
            "body": "很高兴认识你。有问题可以留言，我们会尽快回复。",
            "features": {
                "likes": True,
                "comments": False,
                "rsvp": False,
                "prayer": False,
                "questions": True,
                "dayUnlock": "all",
            },
            "days": [],
            "primaryCta": {"label": "去群里认识大家", "href": "/discover"},
        },
    },
    "testify": {
        "id": "testify",
        "name": "见证墙",
        "domain": "G",
        "tag": "见证",
        "blurb": "征集短见证（用评论投稿）",
        "landing": {
            "title": "",
            "body": "欢迎分享神在你生命中的作为（短文即可）。",
            "features": {"likes": True, "comments": True, "rsvp": False, "prayer": False, "dayUnlock": "all"},
            "days": [],
            "primaryCta": {"label": "写下见证", "href": ""},
        },
    },
    "serve": {
        "id": "serve",
        "name": "服事招募",
        "domain": "D",
        "tag": "招募",
        "blurb": "岗位名额报名（满员自动关闭）",
        "landing": {
            "title": "",
            "body": "欢迎报名服事岗位，名额有限。",
            "features": {
                "likes": True,
                "comments": False,
                "rsvp": False,
                "prayer": False,
                "signup": True,
                "questions": True,
                "dayUnlock": "all",
            },
            "slots": [
                {"id": "slot_a", "title": "岗位 A", "limit": 5},
                {"id": "slot_b", "title": "岗位 B", "limit": 5},
            ],
            "days": [],
            "primaryCta": {"label": "报名参加", "href": ""},
        },
    },
    "season": {
        "id": "season",
        "name": "节期问候",
        "domain": "F",
        "tag": "节期",
        "blurb": "节期图文 + 分享；可选聚会 RSVP",
        "landing": {
            "title": "",
            "body": "愿主的平安与你们同在。",
            "features": {
                "likes": True,
                "comments": False,
                "rsvp": False,
                "prayer": False,
                "countdown": True,
                "dayUnlock": "all",
            },
            "schedule": {"startsAt": "", "endsAt": "", "location": "", "onlineNote": ""},
            "days": [],
            "primaryCta": {"label": "分享给肢体", "href": ""},
        },
    },
    "hub": {
        "id": "hub",
        "name": "多入口",
        "domain": "H",
        "tag": "导航",
        "blurb": "一页分发 2～4 个去处（读经/计划/群等）",
        "landing": {
            "title": "",
            "body": "从这里进入本期推荐内容。",
            "features": {"likes": True, "comments": False, "rsvp": False, "prayer": False, "dayUnlock": "all"},
            "entries": [
                {"id": "e1", "title": "入口一", "sub": "", "href": "/reader"},
                {"id": "e2", "title": "入口二", "sub": "", "href": "/plans"},
            ],
            "days": [],
            "primaryCta": {"label": "查看全部", "href": ""},
        },
    },
}

DOMAIN_LABELS: dict[str, str] = {
    "A": "读经与灵修",
    "B": "代祷与关怀",
    "C": "聚会与节奏",
    "D": "招募与服事",
    "E": "迎新与培育",
    "F": "节期与庆典",
    "G": "见证与回应",
    "H": "挑战与习惯",
}

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ops_campaign (
  id TEXT PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'ended', 'disabled')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  cover_url TEXT,
  subtitle TEXT NOT NULL DEFAULT '',
  rail_slot INT NOT NULL DEFAULT 1 CHECK (rail_slot BETWEEN 1 AND 3),
  rail_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 50,
  landing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_campaign_creator_idx
  ON ops_campaign (creator_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ops_campaign_schedule_idx
  ON ops_campaign (status, rail_enabled, start_at, end_at, rail_slot, priority DESC);
CREATE TABLE IF NOT EXISTS ops_campaign_audience (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES social_group(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, group_id)
);
CREATE INDEX IF NOT EXISTS ops_campaign_audience_group_idx
  ON ops_campaign_audience (group_id);
CREATE TABLE IF NOT EXISTS ops_campaign_like (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS ops_campaign_comment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  day INT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_campaign_comment_idx
  ON ops_campaign_comment (campaign_id, day, created_at DESC);
CREATE TABLE IF NOT EXISTS ops_campaign_rsvp (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('yes', 'no', 'maybe')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS ops_campaign_day_read (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id, day)
);
CREATE TABLE IF NOT EXISTS ops_campaign_open (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS ops_campaign_prayer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_campaign_prayer_idx
  ON ops_campaign_prayer (campaign_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ops_user_template (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_template_id TEXT NOT NULL,
  landing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ops_user_template_user_idx
  ON ops_user_template (user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS ops_campaign_signup (
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, slot_id, user_id)
);
CREATE INDEX IF NOT EXISTS ops_campaign_signup_slot_idx
  ON ops_campaign_signup (campaign_id, slot_id);
CREATE TABLE IF NOT EXISTS ops_campaign_question (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id TEXT NOT NULL REFERENCES ops_campaign(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ops_campaign_question_idx
  ON ops_campaign_question (campaign_id, created_at DESC);
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS audience_mode TEXT NOT NULL DEFAULT 'groups';
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_image_url_dark TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_image_version INT NOT NULL DEFAULT 1;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_alt TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_badge TEXT;
ALTER TABLE ops_campaign
  ADD COLUMN IF NOT EXISTS hero_href TEXT;
CREATE INDEX IF NOT EXISTS ops_campaign_hero_idx
  ON ops_campaign (hero_enabled, status, start_at, end_at, priority DESC);
"""

_schema_ready = False


def ensure_campaign_schema(pool=None) -> None:
    global _schema_ready
    if _schema_ready:
        return
    p = pool or get_pool()
    with p.connection() as conn:
        conn.execute(_SCHEMA_SQL)
    _schema_ready = True


def _new_id() -> str:
    return f"camp_{secrets.token_hex(6)}"


def _parse_dt(value: str | None) -> datetime:
    if not value:
        raise HTTPException(400, "缺少时间")
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError as e:
        raise HTTPException(400, "时间格式无效") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CHINA_TZ)
    return dt.astimezone(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _landing(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _row_campaign(row: tuple, group_ids: list[str] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": row[0],
        "creatorId": str(row[1]),
        "name": row[2],
        "templateId": row[3],
        "status": row[4],
        "startAt": _iso(row[5]),
        "endAt": _iso(row[6]),
        "coverUrl": row[7],
        "subtitle": row[8] or "",
        "railSlot": int(row[9] or 1),
        "railEnabled": bool(row[10]),
        "priority": int(row[11] or 50),
        "landing": _landing(row[12]),
        "groupIds": group_ids or [],
        "createdAt": _iso(row[13]),
        "updatedAt": _iso(row[14]),
        "tag": (TEMPLATES.get(row[3]) or {}).get("tag") or "活动",
    }
    if len(row) > 15:
        out["audienceMode"] = str(row[15] or "groups")
        out["heroEnabled"] = bool(row[16]) if len(row) > 16 else False
        out["heroImageUrl"] = row[17] if len(row) > 17 else None
        out["heroImageUrlDark"] = row[18] if len(row) > 18 else None
        out["heroImageVersion"] = int(row[19] or 1) if len(row) > 19 else 1
        out["heroAlt"] = row[20] or "" if len(row) > 20 else ""
        out["heroBadge"] = row[21] or "" if len(row) > 21 else ""
        out["heroHref"] = row[22] or "" if len(row) > 22 else ""
    else:
        out["audienceMode"] = "groups"
        out["heroEnabled"] = False
        out["heroImageUrl"] = None
        out["heroImageUrlDark"] = None
        out["heroImageVersion"] = 1
        out["heroAlt"] = ""
        out["heroBadge"] = ""
        out["heroHref"] = ""
    return out


def _load_groups(conn, campaign_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT group_id::text FROM ops_campaign_audience WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchall()
    return [str(r[0]) for r in rows]


_CAMPAIGN_SELECT = """
        SELECT id, creator_id, name, template_id, status, start_at, end_at,
               cover_url, subtitle, rail_slot, rail_enabled, priority,
               landing_json, created_at, updated_at,
               COALESCE(audience_mode, 'groups'),
               COALESCE(hero_enabled, FALSE),
               hero_image_url, hero_image_url_dark,
               COALESCE(hero_image_version, 1),
               COALESCE(hero_alt, ''), COALESCE(hero_badge, ''),
               COALESCE(hero_href, '')
        FROM ops_campaign
"""


def _get_row(conn, campaign_id: str) -> tuple | None:
    return conn.execute(
        _CAMPAIGN_SELECT + " WHERE id = %s",
        (campaign_id,),
    ).fetchone()


def _user_is_platform_admin(conn, user_id: str) -> bool:
    from ..admin.auth import phone_is_admin

    row = conn.execute(
        "SELECT phone FROM accounts WHERE user_id = %s::uuid AND phone IS NOT NULL LIMIT 1",
        (user_id,),
    ).fetchone()
    return phone_is_admin(row[0] if row else None)


def _require_platform_admin(conn, user_id: str) -> None:
    """本期活动运营配置仅平台超管开放。"""
    if not _user_is_platform_admin(conn, user_id):
        raise HTTPException(403, "活动运营目前仅平台管理员可用")


def _user_in_audience(conn, campaign_id: str, user_id: str) -> bool:
    meta = conn.execute(
        "SELECT COALESCE(audience_mode, 'groups'), creator_id::text FROM ops_campaign WHERE id = %s",
        (campaign_id,),
    ).fetchone()
    if not meta:
        return False
    mode, creator_id = str(meta[0] or "groups"), str(meta[1])
    if mode == "all":
        return True
    if mode == "admin_preview":
        return str(user_id) == creator_id or _user_is_platform_admin(conn, user_id)
    row = conn.execute(
        """
        SELECT 1 FROM ops_campaign_audience a
        JOIN group_member m ON m.group_id = a.group_id AND m.user_id = %s::uuid
        WHERE a.campaign_id = %s
        LIMIT 1
        """,
        (user_id, campaign_id),
    ).fetchone()
    return bool(row)


def _is_creator(row: tuple, user_id: str) -> bool:
    return str(row[1]) == str(user_id)


def _require_audience_or_creator(conn, row: tuple, user_id: str | None, *, preview: bool = False) -> None:
    if not user_id:
        raise HTTPException(401, "未登录")
    if _is_creator(row, user_id):
        return
    if preview and row[4] == "draft" and _is_creator(row, user_id):
        return
    if not _user_in_audience(conn, row[0], user_id):
        raise HTTPException(403, "此活动仅对指定群开放")
    if row[4] == "draft" and not _is_creator(row, user_id):
        raise HTTPException(403, "活动尚未发布")


def _can_access(conn, row: tuple, user_id: str | None, *, preview: bool = False) -> tuple[bool, str]:
    """返回 (ok, reason)。用于分享落地友好拒访。"""
    if not user_id:
        return False, "请先登录后查看"
    if _is_creator(row, user_id):
        return True, ""
    if row[4] == "draft":
        return False, "活动尚未发布"
    if row[4] in {"ended", "disabled"}:
        # 结束仍允许受众只读回顾
        if _user_in_audience(conn, row[0], user_id):
            return True, ""
        return False, "此活动仅对指定群开放"
    if not _user_in_audience(conn, row[0], user_id):
        return False, "此活动仅对指定群开放"
    return True, ""


def _unlocked_day_cap(start_at: datetime, features: dict[str, Any], days_total: int) -> int:
    mode = str(features.get("dayUnlock") or "all")
    if mode != "by_start" or days_total <= 0:
        return days_total
    start = start_at.astimezone(CHINA_TZ).date()
    today = datetime.now(CHINA_TZ).date()
    if today < start:
        return 0
    return min(days_total, (today - start).days + 1)


def _apply_day_locks(
    landing: dict[str, Any],
    start_at: datetime,
    *,
    is_creator: bool,
) -> tuple[dict[str, Any], int]:
    features = landing.get("features") if isinstance(landing.get("features"), dict) else {}
    days = landing.get("days") if isinstance(landing.get("days"), list) else []
    total = len(days)
    cap = _unlocked_day_cap(start_at, features, total)
    if is_creator or str(features.get("dayUnlock") or "all") != "by_start":
        out_days = []
        for d in days:
            if not isinstance(d, dict):
                continue
            item = dict(d)
            item["locked"] = False
            out_days.append(item)
        landing = {**landing, "days": out_days}
        return landing, cap if str(features.get("dayUnlock") or "all") == "by_start" else total

    out_days = []
    for d in days:
        if not isinstance(d, dict):
            continue
        day_n = int(d.get("day") or 0)
        item = dict(d)
        if day_n > cap:
            item["locked"] = True
            item["body"] = ""
            item["discussionHint"] = ""
            # 保留标题，隐藏正文与经文细节防剧透
            item["verseRef"] = ""
        else:
            item["locked"] = False
        out_days.append(item)
    landing = {**landing, "days": out_days}
    return landing, cap


def _validate_staff_groups(
    conn,
    user_id: str,
    group_ids: list[str],
    *,
    allow_empty: bool = False,
) -> list[str]:
    if not group_ids:
        if allow_empty:
            return []
        raise HTTPException(400, "请选择至少一个群（谁能看见）")
    cleaned: list[str] = []
    for gid in group_ids:
        g = str(gid).strip()
        if not g:
            continue
        access.require_staff(conn, g, user_id)
        cleaned.append(g)
    if not cleaned:
        if allow_empty:
            return []
        raise HTTPException(400, "请选择至少一个群（谁能看见）")
    return cleaned


def _normalize_audience_mode(raw: str | None) -> str:
    mode = str(raw or "groups").strip()
    if mode not in {"groups", "all", "admin_preview"}:
        return "groups"
    return mode


def _resolve_audience_groups(
    conn,
    user_id: str,
    group_ids: list[str],
    audience_mode: str,
    *,
    is_platform_admin: bool,
    allow_empty: bool = False,
) -> list[str]:
    if audience_mode in {"all", "admin_preview"}:
        if not is_platform_admin:
            raise HTTPException(403, "仅平台超管可设置全站或预览受众")
        return []
    # 指定群：仅当前在籍且具备 staff 权的群（已删除/已退出不出现）
    return _validate_staff_groups(conn, user_id, group_ids, allow_empty=allow_empty)


def _publish_checklist(
    body: dict[str, Any],
    group_ids: list[str],
    *,
    audience_mode: str = "groups",
    is_platform_admin: bool = False,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    rail_enabled: bool = True,
    rail_slot: int = 1,
) -> list[str]:
    errors: list[str] = []
    mode = _normalize_audience_mode(audience_mode)
    if mode in {"all", "admin_preview"}:
        if not is_platform_admin:
            errors.append("仅平台超管可发布全站/预览受众")
    elif not group_ids:
        errors.append("请选择谁能看见（至少一个群）")
    if not str(body.get("name") or "").strip():
        errors.append("请填写活动名称")
    landing = body.get("landing") if isinstance(body.get("landing"), dict) else {}
    title = str(landing.get("title") or body.get("name") or "").strip()
    if not title:
        errors.append("请填写页面标题")
    if start_at is not None and end_at is not None and end_at <= start_at:
        errors.append("结束时间须晚于开始时间")
    if rail_enabled and not (1 <= int(rail_slot or 0) <= 3):
        errors.append("请选择今日推荐位置（第 1～3 位）")
    template_id = str(body.get("templateId") or "")
    days = landing.get("days") if isinstance(landing.get("days"), list) else []
    body_text = str(landing.get("body") or "").strip()
    if template_id in {"multi_day", "memory", "verse_day"}:
        filled = [
            d
            for d in days
            if isinstance(d, dict)
            and (str(d.get("body") or "").strip() or str(d.get("verseRef") or "").strip())
        ]
        if not filled:
            errors.append("日课/经文清单至少填写一天内容")
    if template_id == "gathering":
        schedule = landing.get("schedule") if isinstance(landing.get("schedule"), dict) else {}
        if not str(schedule.get("startsAt") or "").strip():
            errors.append("聚会请填写开始时间")
        if not str(schedule.get("location") or "").strip() and not str(schedule.get("onlineNote") or "").strip():
            errors.append("聚会请填写地点或线上说明")
    if template_id == "season" and not body_text:
        errors.append("请填写节期说明")
    if template_id == "serve":
        slots = landing.get("slots") if isinstance(landing.get("slots"), list) else []
        valid = [
            s
            for s in slots
            if isinstance(s, dict) and str(s.get("title") or "").strip() and int(s.get("limit") or 0) > 0
        ]
        if not valid:
            errors.append("服事招募请至少配置一个有名额的岗位")
    if template_id == "hub":
        entries = landing.get("entries") if isinstance(landing.get("entries"), list) else []
        valid_e = [
            e
            for e in entries
            if isinstance(e, dict) and str(e.get("title") or "").strip() and str(e.get("href") or "").strip()
        ]
        if len(valid_e) < 2:
            errors.append("多入口请至少配置 2 个有效入口（标题+链接）")
    if template_id == "promo":
        if not body_text:
            errors.append("请填写动员说明")
    if template_id in {"prayer_drive", "welcome", "testify"} and not body_text:
        errors.append("请填写活动说明")
    return errors


def _expire_due_campaigns(conn) -> int:
    """已过 end_at 的 published 自动标为 ended。"""
    cur = conn.execute(
        """
        UPDATE ops_campaign
        SET status = 'ended', updated_at = now()
        WHERE status = 'published' AND end_at < now()
        """
    )
    return int(cur.rowcount or 0)


class CampaignUpsert(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=80)
    templateId: str
    status: str = "draft"
    startAt: str
    endAt: str
    coverUrl: str | None = None
    subtitle: str = ""
    railSlot: int = 1
    railEnabled: bool = True
    priority: int = 50
    groupIds: list[str] = Field(default_factory=list)
    landing: dict[str, Any] = Field(default_factory=dict)
    audienceMode: str = "groups"
    heroEnabled: bool = False
    heroImageUrl: str | None = None
    heroImageUrlDark: str | None = None
    heroImageVersion: int = 1
    heroAlt: str = ""
    heroBadge: str = ""
    heroHref: str = ""


class CommentBody(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    day: int | None = None


class RsvpBody(BaseModel):
    status: str


class PrayerBody(BaseModel):
    body: str = Field(min_length=1, max_length=500)


class DayReadBody(BaseModel):
    day: int = Field(ge=1, le=366)


@router.get("/templates")
def list_templates(user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
    return {
        "domains": [{"id": k, "label": v} for k, v in DOMAIN_LABELS.items()],
        "templates": [
            {
                "id": t["id"],
                "name": t["name"],
                "domain": t["domain"],
                "domainLabel": DOMAIN_LABELS.get(t["domain"]) or t["domain"],
                "tag": t["tag"],
                "blurb": t["blurb"],
                "landing": t["landing"],
            }
            for t in TEMPLATES.values()
        ]
    }


@router.get("/staff-groups")
def staff_groups(user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        # 仅当前在籍且具备群主/管理员身份的群；已删除群不在表中
        rows = conn.execute(
            """
            SELECT g.id::text, g.name, m.role
            FROM social_group g
            INNER JOIN group_member m ON m.group_id = g.id AND m.user_id = %s::uuid
            WHERE m.role IN ('owner', 'admin')
            ORDER BY g.name ASC
            LIMIT 200
            """,
            (user_id,),
        ).fetchall()
    return {
        "groups": [{"id": r[0], "name": r[1], "role": r[2]} for r in rows],
    }


@router.get("")
def list_my_campaigns(
    status: str | None = Query(None),
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        _expire_due_campaigns(conn)
        rows = conn.execute(
            _CAMPAIGN_SELECT
            + """
            WHERE creator_id = %s::uuid
            ORDER BY updated_at DESC
            LIMIT 100
            """,
            (user_id,),
        ).fetchall()
        items = []
        for row in rows:
            if status and status != "all" and row[4] != status:
                continue
            gids = _load_groups(conn, row[0])
            item = _row_campaign(row, gids)
            stats = _light_stats(conn, row[0])
            item["stats"] = stats
            items.append(item)
    return {"campaigns": items}


def _light_stats(conn, campaign_id: str) -> dict[str, int]:
    opens = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_open WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    reads = conn.execute(
        "SELECT count(DISTINCT user_id)::int FROM ops_campaign_day_read WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    rsvps = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_rsvp WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    likes = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_like WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    comments = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_comment WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    prayers = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_prayer WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    signups = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_signup WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    questions = conn.execute(
        "SELECT count(*)::int FROM ops_campaign_question WHERE campaign_id = %s",
        (campaign_id,),
    ).fetchone()[0]
    return {
        "opens": opens,
        "readers": reads,
        "rsvps": rsvps,
        "likes": likes,
        "comments": comments,
        "prayers": prayers,
        "signups": signups,
        "questions": questions,
    }


def _hero_write_fields(body: CampaignUpsert, *, is_platform_admin: bool) -> dict[str, Any]:
    """活动运营不挂载 Hero；曝光仅走今日推荐。仍允许超管设全站/预览受众。"""
    mode = _normalize_audience_mode(body.audienceMode)
    if not is_platform_admin:
        mode = "groups"
    return {
        "audience_mode": mode,
        "hero_enabled": False,
        "hero_image_url": None,
        "hero_image_url_dark": None,
        "hero_image_version": 1,
        "hero_alt": "",
        "hero_badge": "",
        "hero_href": "",
    }


def _ops_hero_public(row: tuple) -> dict[str, Any] | None:
    """与 hero_b_ops._public_campaign 同形，供首页轮播消费。"""
    image = (row[17] if len(row) > 17 else None) or ""
    if not image:
        return None
    v = int(row[19] or 1) if len(row) > 19 else 1
    sep = "&" if "?" in image else "?"
    image_url = f"{image}{sep}v={v}"
    dark = row[18] if len(row) > 18 else None
    image_url_dark = None
    if dark:
        sep_d = "&" if "?" in str(dark) else "?"
        image_url_dark = f"{dark}{sep_d}v={v}"
    href = (row[22] if len(row) > 22 else "") or f"/campaigns/view/{row[0]}"
    out: dict[str, Any] = {
        "id": row[0],
        "imageUrl": image_url,
        "alt": (row[20] if len(row) > 20 else "") or row[2] or "活动",
        "href": href,
    }
    badge = (row[21] if len(row) > 21 else "") or ""
    if badge:
        out["badge"] = badge[:6]
    if image_url_dark:
        out["imageUrlDark"] = image_url_dark
    return out


def pick_ops_hero_public(
    *,
    admin_preview: bool = False,
    preview_campaign_id: str | None = None,
) -> dict[str, Any] | None:
    """优先从 ops_campaign 取 Hero；无则返回 None（由调用方回退旧 Hero B）。"""
    try:
        ensure_campaign_schema()
        now = datetime.now(timezone.utc)
        with get_pool().connection() as conn:
            _expire_due_campaigns(conn)
            if preview_campaign_id and admin_preview and str(preview_campaign_id).startswith("camp_"):
                row = conn.execute(
                    _CAMPAIGN_SELECT + " WHERE id = %s",
                    (preview_campaign_id,),
                ).fetchone()
                if row and bool(row[16]):
                    return _ops_hero_public(row)
                return None
            rows = conn.execute(
                _CAMPAIGN_SELECT
                + """
                WHERE hero_enabled = TRUE
                  AND status = 'published'
                  AND start_at <= %s AND end_at >= %s
                  AND hero_image_url IS NOT NULL AND hero_image_url <> ''
                ORDER BY priority DESC, updated_at DESC
                LIMIT 20
                """,
                (now, now),
            ).fetchall()
        for row in rows:
            mode = str(row[15] or "groups")
            if mode == "admin_preview" and not admin_preview:
                continue
            if mode in {"all", "admin_preview"}:
                pub = _ops_hero_public(row)
                if pub:
                    return pub
            # groups 定向不占全站 Hero
        return None
    except Exception:
        logger.exception("pick_ops_hero_public failed")
        return None


@router.post("")
def create_campaign(body: CampaignUpsert, user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    if body.templateId not in TEMPLATES:
        raise HTTPException(400, "未知模板")
    status = body.status if body.status in {"draft", "published"} else "draft"
    start_at = _parse_dt(body.startAt)
    end_at = _parse_dt(body.endAt)
    if end_at <= start_at:
        raise HTTPException(400, "结束时间须晚于开始时间")
    rail_slot = min(3, max(1, int(body.railSlot or 1)))
    landing = body.landing or dict(TEMPLATES[body.templateId]["landing"])
    if not landing.get("title"):
        landing["title"] = body.name.strip()

    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        is_admin = True
        hero = _hero_write_fields(body, is_platform_admin=is_admin)
        group_ids = _resolve_audience_groups(
            conn,
            user_id,
            body.groupIds,
            hero["audience_mode"],
            is_platform_admin=is_admin,
            allow_empty=(status == "draft"),
        )
        payload = {
            "name": body.name.strip(),
            "templateId": body.templateId,
            "landing": landing,
        }
        if status == "published":
            errs = _publish_checklist(
                payload,
                group_ids,
                audience_mode=hero["audience_mode"],
                is_platform_admin=is_admin,
                start_at=start_at,
                end_at=end_at,
                rail_enabled=bool(body.railEnabled),
                rail_slot=rail_slot,
            )
            if errs:
                raise HTTPException(400, "；".join(errs))
        cid = body.id if body.id and _ID_RE.match(body.id) else _new_id()
        if _get_row(conn, cid):
            raise HTTPException(400, "活动 ID 已存在")
        conn.execute(
            """
            INSERT INTO ops_campaign (
              id, creator_id, name, template_id, status, start_at, end_at,
              cover_url, subtitle, rail_slot, rail_enabled, priority, landing_json,
              audience_mode, hero_enabled, hero_image_url, hero_image_url_dark,
              hero_image_version, hero_alt, hero_badge, hero_href
            ) VALUES (
              %s, %s::uuid, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s, %s::jsonb,
              %s, %s, %s, %s, %s, %s, %s, %s
            )
            """,
            (
                cid,
                user_id,
                body.name.strip(),
                body.templateId,
                status,
                start_at,
                end_at,
                (body.coverUrl or "").strip() or None,
                (body.subtitle or "").strip()[:80],
                rail_slot,
                bool(body.railEnabled),
                int(body.priority or 50),
                json.dumps(landing, ensure_ascii=False),
                hero["audience_mode"],
                hero["hero_enabled"],
                hero["hero_image_url"],
                hero["hero_image_url_dark"],
                hero["hero_image_version"],
                hero["hero_alt"],
                hero["hero_badge"],
                hero["hero_href"],
            ),
        )
        for gid in group_ids:
            conn.execute(
                "INSERT INTO ops_campaign_audience (campaign_id, group_id) VALUES (%s, %s::uuid)",
                (cid, gid),
            )
        row = _get_row(conn, cid)
        return {"campaign": _row_campaign(row, group_ids)}


@router.get("/home")
def home_campaigns(user_id: str | None = Depends(try_get_current_user)) -> dict:
    """首页今日推荐：按成员过滤的已发布活动（含全站）。"""
    ensure_campaign_schema()
    if not user_id:
        return {"campaigns": []}
    now = datetime.now(timezone.utc)
    with get_pool().connection() as conn:
        _expire_due_campaigns(conn)
        is_admin = _user_is_platform_admin(conn, user_id)
        rows = conn.execute(
            """
            SELECT DISTINCT c.id, c.creator_id, c.name, c.template_id, c.status, c.start_at, c.end_at,
                   c.cover_url, c.subtitle, c.rail_slot, c.rail_enabled, c.priority,
                   c.landing_json, c.created_at, c.updated_at
            FROM ops_campaign c
            LEFT JOIN ops_campaign_audience a ON a.campaign_id = c.id
            LEFT JOIN group_member m ON m.group_id = a.group_id AND m.user_id = %s::uuid
            WHERE c.status = 'published'
              AND c.rail_enabled = TRUE
              AND c.start_at <= %s AND c.end_at >= %s
              AND (
                COALESCE(c.audience_mode, 'groups') = 'all'
                OR (COALESCE(c.audience_mode, 'groups') = 'admin_preview' AND %s)
                OR (COALESCE(c.audience_mode, 'groups') = 'groups' AND m.user_id IS NOT NULL)
              )
            ORDER BY c.rail_slot ASC, c.priority DESC, c.updated_at DESC
            LIMIT 12
            """,
            (user_id, now, now, is_admin),
        ).fetchall()
        # 每位用户最多露出 3 张运营卡（对应今日推荐三坑）
        by_slot: dict[int, tuple] = {}
        extras: list[tuple] = []
        for row in rows:
            slot = int(row[9] or 1)
            if slot not in by_slot:
                by_slot[slot] = row
            else:
                extras.append(row)
        ordered = [by_slot[s] for s in sorted(by_slot.keys())]
        for row in extras:
            if len(ordered) >= 3:
                break
            ordered.append(row)
        ordered = ordered[:3]
        out = []
        for row in ordered:
            landing = _landing(row[12])
            days = landing.get("days") if isinstance(landing.get("days"), list) else []
            read_n = conn.execute(
                "SELECT count(*)::int FROM ops_campaign_day_read WHERE campaign_id = %s AND user_id = %s::uuid",
                (row[0], user_id),
            ).fetchone()[0]
            out.append(
                {
                    "id": row[0],
                    "name": row[2],
                    "templateId": row[3],
                    "tag": (TEMPLATES.get(row[3]) or {}).get("tag") or "活动",
                    "subtitle": row[8] or str(landing.get("body") or "")[:40],
                    "coverUrl": row[7],
                    "railSlot": int(row[9] or 1),
                    "href": f"/campaigns/view/{row[0]}",
                    "daysTotal": len(days),
                    "daysRead": int(read_n or 0),
                }
            )
    return {"campaigns": out}


class UserTemplateBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    baseTemplateId: str
    landing: dict[str, Any] = Field(default_factory=dict)


@router.get("/user-templates")
def list_user_templates(user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        rows = conn.execute(
            """
            SELECT id, name, base_template_id, landing_json, created_at, updated_at
            FROM ops_user_template WHERE user_id = %s::uuid
            ORDER BY updated_at DESC LIMIT 20
            """,
            (user_id,),
        ).fetchall()
    return {
        "templates": [
            {
                "id": r[0],
                "name": r[1],
                "baseTemplateId": r[2],
                "landing": _landing(r[3]),
                "createdAt": _iso(r[4]),
                "updatedAt": _iso(r[5]),
            }
            for r in rows
        ]
    }


@router.post("/user-templates")
def save_user_template(body: UserTemplateBody, user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    if body.baseTemplateId not in TEMPLATES:
        raise HTTPException(400, "未知基础模板")
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        count = conn.execute(
            "SELECT count(*)::int FROM ops_user_template WHERE user_id = %s::uuid",
            (user_id,),
        ).fetchone()[0]
        if count >= 20:
            raise HTTPException(400, "我的模板最多 20 个，请先删除旧模板")
        tid = f"utpl_{secrets.token_hex(5)}"
        conn.execute(
            """
            INSERT INTO ops_user_template (id, user_id, name, base_template_id, landing_json)
            VALUES (%s, %s::uuid, %s, %s, %s::jsonb)
            """,
            (
                tid,
                user_id,
                body.name.strip(),
                body.baseTemplateId,
                json.dumps(body.landing or {}, ensure_ascii=False),
            ),
        )
    return {"ok": True, "id": tid}


@router.delete("/user-templates/{template_id}")
def delete_user_template(template_id: str, user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        cur = conn.execute(
            "DELETE FROM ops_user_template WHERE id = %s AND user_id = %s::uuid",
            (template_id, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "模板不存在")
    return {"ok": True}


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: str,
    preview: bool = Query(False),
    user_id: str | None = Depends(try_get_current_user),
) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _expire_due_campaigns(conn)
        row = _get_row(conn, campaign_id) or row
        ok, reason = _can_access(conn, row, user_id, preview=preview)
        # 创建者预览草稿
        if preview and user_id and _is_creator(row, user_id):
            ok, reason = True, ""
        if not ok:
            return {
                "ok": False,
                "denied": True,
                "message": reason or "此活动仅对指定群开放",
                "teaser": {
                    "id": row[0],
                    "name": row[2],
                    "tag": (TEMPLATES.get(row[3]) or {}).get("tag") or "活动",
                    "status": row[4],
                },
            }
        gids = _load_groups(conn, campaign_id)
        item = _row_campaign(row, gids)
        is_creator = bool(user_id and _is_creator(row, user_id))
        item["isCreator"] = is_creator
        landing, unlock_cap = _apply_day_locks(item["landing"], row[5], is_creator=is_creator)
        item["landing"] = landing
        item["unlockedDayCap"] = unlock_cap
        if user_id:
            conn.execute(
                """
                INSERT INTO ops_campaign_open (campaign_id, user_id, opened_at)
                VALUES (%s, %s::uuid, now())
                ON CONFLICT (campaign_id, user_id) DO UPDATE SET opened_at = now()
                """,
                (campaign_id, user_id),
            )
            liked = conn.execute(
                "SELECT 1 FROM ops_campaign_like WHERE campaign_id = %s AND user_id = %s::uuid",
                (campaign_id, user_id),
            ).fetchone()
            item["liked"] = bool(liked)
            rsvp = conn.execute(
                "SELECT status FROM ops_campaign_rsvp WHERE campaign_id = %s AND user_id = %s::uuid",
                (campaign_id, user_id),
            ).fetchone()
            item["myRsvp"] = rsvp[0] if rsvp else None
            reads = conn.execute(
                "SELECT day FROM ops_campaign_day_read WHERE campaign_id = %s AND user_id = %s::uuid",
                (campaign_id, user_id),
            ).fetchall()
            item["readDays"] = [int(r[0]) for r in reads]
        else:
            item["liked"] = False
            item["myRsvp"] = None
            item["readDays"] = []
        likes = conn.execute(
            "SELECT count(*)::int FROM ops_campaign_like WHERE campaign_id = %s",
            (campaign_id,),
        ).fetchone()[0]
        item["likesCount"] = likes
        rsvp_stats = conn.execute(
            """
            SELECT status, count(*)::int FROM ops_campaign_rsvp
            WHERE campaign_id = %s GROUP BY status
            """,
            (campaign_id,),
        ).fetchall()
        item["rsvpStats"] = {r[0]: r[1] for r in rsvp_stats}
        if is_creator:
            item["stats"] = _light_stats(conn, campaign_id)
        features = (item["landing"].get("features") or {}) if isinstance(item["landing"], dict) else {}
        if features.get("prayer"):
            if is_creator or not features.get("prayerPrivate", True):
                prayers = conn.execute(
                    """
                    SELECT id::text, user_id::text, body, created_at
                    FROM ops_campaign_prayer WHERE campaign_id = %s
                    ORDER BY created_at DESC LIMIT 50
                    """,
                    (campaign_id,),
                ).fetchall()
                item["prayers"] = [
                    {"id": p[0], "userId": p[1], "body": p[2], "createdAt": _iso(p[3])}
                    for p in prayers
                ]
            else:
                item["prayers"] = []
        # 结束态：关闭 RSVP 写入提示
        item["interactionClosed"] = row[4] in {"ended", "disabled"} or (
            row[6] is not None and row[6] < datetime.now(timezone.utc)
        )
        comments = conn.execute(
            """
            SELECT id::text, day, user_id::text, body, created_at
            FROM ops_campaign_comment WHERE campaign_id = %s
            ORDER BY created_at DESC LIMIT 50
            """,
            (campaign_id,),
        ).fetchall()
        item["comments"] = [
            {
                "id": c[0],
                "day": c[1],
                "userId": c[2],
                "body": c[3],
                "createdAt": _iso(c[4]),
            }
            for c in comments
        ]
        # 名额报名
        slots = landing.get("slots") if isinstance(landing.get("slots"), list) else []
        slot_stats: list[dict[str, Any]] = []
        my_slots: list[str] = []
        if features.get("signup") or slots:
            for s in slots:
                if not isinstance(s, dict):
                    continue
                sid = str(s.get("id") or "").strip()
                if not sid:
                    continue
                limit = max(0, int(s.get("limit") or 0))
                taken = conn.execute(
                    "SELECT count(*)::int FROM ops_campaign_signup WHERE campaign_id = %s AND slot_id = %s",
                    (campaign_id, sid),
                ).fetchone()[0]
                slot_stats.append(
                    {
                        "id": sid,
                        "title": str(s.get("title") or sid),
                        "limit": limit,
                        "taken": taken,
                        "remaining": max(0, limit - taken) if limit else None,
                    }
                )
            if user_id:
                mine = conn.execute(
                    "SELECT slot_id FROM ops_campaign_signup WHERE campaign_id = %s AND user_id = %s::uuid",
                    (campaign_id, user_id),
                ).fetchall()
                my_slots = [str(m[0]) for m in mine]
        item["slots"] = slot_stats
        item["mySlots"] = my_slots
        # 提问箱：成员只看自己的；创建者看全部
        if features.get("questions"):
            if is_creator:
                qrows = conn.execute(
                    """
                    SELECT id::text, user_id::text, body, answer, created_at, answered_at
                    FROM ops_campaign_question WHERE campaign_id = %s
                    ORDER BY created_at DESC LIMIT 100
                    """,
                    (campaign_id,),
                ).fetchall()
            elif user_id:
                qrows = conn.execute(
                    """
                    SELECT id::text, user_id::text, body, answer, created_at, answered_at
                    FROM ops_campaign_question
                    WHERE campaign_id = %s AND user_id = %s::uuid
                    ORDER BY created_at DESC LIMIT 50
                    """,
                    (campaign_id, user_id),
                ).fetchall()
            else:
                qrows = []
            item["questions"] = [
                {
                    "id": q[0],
                    "userId": q[1],
                    "body": q[2],
                    "answer": q[3],
                    "createdAt": _iso(q[4]),
                    "answeredAt": _iso(q[5]),
                }
                for q in qrows
            ]
        else:
            item["questions"] = []
    return {"ok": True, "denied": False, "campaign": item}


@router.put("/{campaign_id}")
def update_campaign(
    campaign_id: str,
    body: CampaignUpsert,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    if body.templateId not in TEMPLATES:
        raise HTTPException(400, "未知模板")
    status = body.status if body.status in {"draft", "published", "ended", "disabled"} else "draft"
    start_at = _parse_dt(body.startAt)
    end_at = _parse_dt(body.endAt)
    if end_at <= start_at:
        raise HTTPException(400, "结束时间须晚于开始时间")
    rail_slot = min(3, max(1, int(body.railSlot or 1)))
    landing = body.landing or {}
    if not landing.get("title"):
        landing["title"] = body.name.strip()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        if not _is_creator(row, user_id):
            raise HTTPException(403, "仅创建者可编辑")
        is_admin = True
        hero = _hero_write_fields(body, is_platform_admin=is_admin)
        group_ids = _resolve_audience_groups(
            conn,
            user_id,
            body.groupIds,
            hero["audience_mode"],
            is_platform_admin=is_admin,
            allow_empty=(status == "draft"),
        )
        payload = {
            "name": body.name,
            "templateId": body.templateId,
            "landing": landing,
        }
        if status == "published":
            errs = _publish_checklist(
                payload,
                group_ids,
                audience_mode=hero["audience_mode"],
                is_platform_admin=is_admin,
                start_at=start_at,
                end_at=end_at,
                rail_enabled=bool(body.railEnabled),
                rail_slot=rail_slot,
            )
            if errs:
                raise HTTPException(400, "；".join(errs))
        conn.execute(
            """
            UPDATE ops_campaign SET
              name = %s, template_id = %s, status = %s, start_at = %s, end_at = %s,
              cover_url = %s, subtitle = %s, rail_slot = %s, rail_enabled = %s,
              priority = %s, landing_json = %s::jsonb,
              audience_mode = %s, hero_enabled = %s, hero_image_url = %s,
              hero_image_url_dark = %s, hero_image_version = %s,
              hero_alt = %s, hero_badge = %s, hero_href = %s,
              updated_at = now()
            WHERE id = %s
            """,
            (
                body.name.strip(),
                body.templateId,
                status,
                start_at,
                end_at,
                (body.coverUrl or "").strip() or None,
                (body.subtitle or "").strip()[:80],
                rail_slot,
                bool(body.railEnabled),
                int(body.priority or 50),
                json.dumps(landing, ensure_ascii=False),
                hero["audience_mode"],
                hero["hero_enabled"],
                hero["hero_image_url"],
                hero["hero_image_url_dark"],
                hero["hero_image_version"],
                hero["hero_alt"],
                hero["hero_badge"],
                hero["hero_href"],
                campaign_id,
            ),
        )
        conn.execute("DELETE FROM ops_campaign_audience WHERE campaign_id = %s", (campaign_id,))
        for gid in group_ids:
            conn.execute(
                "INSERT INTO ops_campaign_audience (campaign_id, group_id) VALUES (%s, %s::uuid)",
                (campaign_id, gid),
            )
        row = _get_row(conn, campaign_id)
        return {"campaign": _row_campaign(row, group_ids)}


@router.post("/{campaign_id}/copy")
def copy_campaign(campaign_id: str, user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        if not _is_creator(row, user_id):
            raise HTTPException(403, "仅创建者可复制")
        gids = _load_groups(conn, campaign_id)
        new_id = _new_id()
        landing = _landing(row[12])
        conn.execute(
            """
            INSERT INTO ops_campaign (
              id, creator_id, name, template_id, status, start_at, end_at,
              cover_url, subtitle, rail_slot, rail_enabled, priority, landing_json
            ) VALUES (
              %s, %s::uuid, %s, %s, 'draft', %s, %s,
              %s, %s, %s, %s, %s, %s::jsonb
            )
            """,
            (
                new_id,
                user_id,
                f"{row[2]}（副本）",
                row[3],
                row[5],
                row[6],
                row[7],
                row[8],
                row[9],
                row[10],
                row[11],
                json.dumps(landing, ensure_ascii=False),
            ),
        )
        for gid in gids:
            conn.execute(
                "INSERT INTO ops_campaign_audience (campaign_id, group_id) VALUES (%s, %s::uuid)",
                (new_id, gid),
            )
        nrow = _get_row(conn, new_id)
        return {"campaign": _row_campaign(nrow, gids)}


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: str, user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        if not _is_creator(row, user_id):
            raise HTTPException(403, "仅创建者可删除")
        conn.execute("DELETE FROM ops_campaign WHERE id = %s", (campaign_id,))
    return {"ok": True}


@router.post("/{campaign_id}/like")
def toggle_like(campaign_id: str, user_id: str = Depends(get_current_user)) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        existing = conn.execute(
            "SELECT 1 FROM ops_campaign_like WHERE campaign_id = %s AND user_id = %s::uuid",
            (campaign_id, user_id),
        ).fetchone()
        if existing:
            conn.execute(
                "DELETE FROM ops_campaign_like WHERE campaign_id = %s AND user_id = %s::uuid",
                (campaign_id, user_id),
            )
            liked = False
        else:
            conn.execute(
                "INSERT INTO ops_campaign_like (campaign_id, user_id) VALUES (%s, %s::uuid)",
                (campaign_id, user_id),
            )
            liked = True
        count = conn.execute(
            "SELECT count(*)::int FROM ops_campaign_like WHERE campaign_id = %s",
            (campaign_id,),
        ).fetchone()[0]
    return {"liked": liked, "likesCount": count}


@router.post("/{campaign_id}/comments")
def add_comment(
    campaign_id: str,
    body: CommentBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "评论不能为空")
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        cur = conn.execute(
            """
            INSERT INTO ops_campaign_comment (campaign_id, day, user_id, body)
            VALUES (%s, %s, %s::uuid, %s)
            RETURNING id::text, day, user_id::text, body, created_at
            """,
            (campaign_id, body.day, user_id, text),
        )
        c = cur.fetchone()
    return {
        "comment": {
            "id": c[0],
            "day": c[1],
            "userId": c[2],
            "body": c[3],
            "createdAt": _iso(c[4]),
        }
    }


@router.post("/{campaign_id}/rsvp")
def upsert_rsvp(
    campaign_id: str,
    body: RsvpBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    if body.status not in {"yes", "no", "maybe"}:
        raise HTTPException(400, "RSVP 无效")
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        if row[4] not in {"published", "draft"}:
            raise HTTPException(400, "活动已结束，无法表态")
        conn.execute(
            """
            INSERT INTO ops_campaign_rsvp (campaign_id, user_id, status, updated_at)
            VALUES (%s, %s::uuid, %s, now())
            ON CONFLICT (campaign_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()
            """,
            (campaign_id, user_id, body.status),
        )
        stats = conn.execute(
            """
            SELECT status, count(*)::int FROM ops_campaign_rsvp
            WHERE campaign_id = %s GROUP BY status
            """,
            (campaign_id,),
        ).fetchall()
    return {"myRsvp": body.status, "rsvpStats": {r[0]: r[1] for r in stats}}


@router.post("/{campaign_id}/prayer")
def add_prayer(
    campaign_id: str,
    body: PrayerBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "意向不能为空")
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        cur = conn.execute(
            """
            INSERT INTO ops_campaign_prayer (campaign_id, user_id, body)
            VALUES (%s, %s::uuid, %s)
            RETURNING id::text
            """,
            (campaign_id, user_id, text),
        )
        pid = cur.fetchone()[0]
    return {"ok": True, "id": pid}


@router.post("/{campaign_id}/day-read")
def mark_day_read(
    campaign_id: str,
    body: DayReadBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        landing = _landing(row[12])
        features = landing.get("features") if isinstance(landing.get("features"), dict) else {}
        days = landing.get("days") if isinstance(landing.get("days"), list) else []
        is_creator = _is_creator(row, user_id)
        cap = _unlocked_day_cap(row[5], features, len(days))
        if not is_creator and str(features.get("dayUnlock") or "all") == "by_start" and body.day > cap:
            raise HTTPException(400, "该日尚未解锁")
        conn.execute(
            """
            INSERT INTO ops_campaign_day_read (campaign_id, user_id, day)
            VALUES (%s, %s::uuid, %s)
            ON CONFLICT DO NOTHING
            """,
            (campaign_id, user_id, body.day),
        )
        reads = conn.execute(
            "SELECT day FROM ops_campaign_day_read WHERE campaign_id = %s AND user_id = %s::uuid",
            (campaign_id, user_id),
        ).fetchall()
    return {"readDays": [int(r[0]) for r in reads]}


class ExtendBody(BaseModel):
    days: int = Field(default=7, ge=1, le=90)


@router.post("/{campaign_id}/extend")
def extend_campaign(
    campaign_id: str,
    body: ExtendBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    with get_pool().connection() as conn:
        _require_platform_admin(conn, user_id)
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        if not _is_creator(row, user_id):
            raise HTTPException(403, "仅创建者可延期")
        new_end = row[6] + timedelta(days=int(body.days))
        conn.execute(
            "UPDATE ops_campaign SET end_at = %s, status = CASE WHEN status = 'ended' THEN 'published' ELSE status END, updated_at = now() WHERE id = %s",
            (new_end, campaign_id),
        )
        nrow = _get_row(conn, campaign_id)
        gids = _load_groups(conn, campaign_id)
        return {"campaign": _row_campaign(nrow, gids)}


class SignupBody(BaseModel):
    slotId: str = Field(min_length=1, max_length=64)


@router.post("/{campaign_id}/signup")
def toggle_signup(
    campaign_id: str,
    body: SignupBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    slot_id = body.slotId.strip()
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        if row[4] in {"ended", "disabled"} or (row[6] and row[6] < datetime.now(timezone.utc)):
            raise HTTPException(400, "活动已结束，无法报名")
        landing = _landing(row[12])
        slots = landing.get("slots") if isinstance(landing.get("slots"), list) else []
        slot = next((s for s in slots if isinstance(s, dict) and str(s.get("id")) == slot_id), None)
        if not slot:
            raise HTTPException(400, "岗位不存在")
        limit = max(0, int(slot.get("limit") or 0))
        existing = conn.execute(
            "SELECT 1 FROM ops_campaign_signup WHERE campaign_id = %s AND slot_id = %s AND user_id = %s::uuid",
            (campaign_id, slot_id, user_id),
        ).fetchone()
        if existing:
            conn.execute(
                "DELETE FROM ops_campaign_signup WHERE campaign_id = %s AND slot_id = %s AND user_id = %s::uuid",
                (campaign_id, slot_id, user_id),
            )
            joined = False
        else:
            taken = conn.execute(
                "SELECT count(*)::int FROM ops_campaign_signup WHERE campaign_id = %s AND slot_id = %s",
                (campaign_id, slot_id),
            ).fetchone()[0]
            if limit and taken >= limit:
                raise HTTPException(400, "该岗位名额已满")
            conn.execute(
                "INSERT INTO ops_campaign_signup (campaign_id, slot_id, user_id) VALUES (%s, %s, %s::uuid)",
                (campaign_id, slot_id, user_id),
            )
            joined = True
        taken = conn.execute(
            "SELECT count(*)::int FROM ops_campaign_signup WHERE campaign_id = %s AND slot_id = %s",
            (campaign_id, slot_id),
        ).fetchone()[0]
        mine = conn.execute(
            "SELECT slot_id FROM ops_campaign_signup WHERE campaign_id = %s AND user_id = %s::uuid",
            (campaign_id, user_id),
        ).fetchall()
    return {
        "joined": joined,
        "slotId": slot_id,
        "taken": taken,
        "remaining": max(0, limit - taken) if limit else None,
        "mySlots": [str(m[0]) for m in mine],
    }


class QuestionBody(BaseModel):
    body: str = Field(min_length=1, max_length=500)


@router.post("/{campaign_id}/questions")
def ask_question(
    campaign_id: str,
    body: QuestionBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "问题不能为空")
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        _require_audience_or_creator(conn, row, user_id)
        cur = conn.execute(
            """
            INSERT INTO ops_campaign_question (campaign_id, user_id, body)
            VALUES (%s, %s::uuid, %s)
            RETURNING id::text, created_at
            """,
            (campaign_id, user_id, text),
        )
        q = cur.fetchone()
    return {
        "question": {
            "id": q[0],
            "userId": user_id,
            "body": text,
            "answer": None,
            "createdAt": _iso(q[1]),
            "answeredAt": None,
        }
    }


class AnswerBody(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


@router.post("/{campaign_id}/questions/{question_id}/answer")
def answer_question(
    campaign_id: str,
    question_id: str,
    body: AnswerBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    ensure_campaign_schema()
    text = body.answer.strip()
    if not text:
        raise HTTPException(400, "回复不能为空")
    with get_pool().connection() as conn:
        row = _get_row(conn, campaign_id)
        if not row:
            raise HTTPException(404, "活动不存在")
        if not _is_creator(row, user_id):
            raise HTTPException(403, "仅创建者可回复提问")
        cur = conn.execute(
            """
            UPDATE ops_campaign_question
            SET answer = %s, answered_at = now()
            WHERE id = %s::uuid AND campaign_id = %s
            RETURNING id::text
            """,
            (text, question_id, campaign_id),
        )
        if not cur.fetchone():
            raise HTTPException(404, "问题不存在")
    return {"ok": True, "answer": text}
