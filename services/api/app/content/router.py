"""静态内容接口。经库可解析时填充经文正文。"""
from __future__ import annotations

import logging
import re
from datetime import date

from fastapi import APIRouter, Header, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..auth.user_code import is_user_code
from ..db import get_pool
from . import loader
from .planner import SCOPE_LABELS, generate_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])


class GeneratePlanBody(BaseModel):
    scope: str | None = None
    days: int = 30
    theme: str | None = None
    custom_refs: str | None = None  # 额外自定义经节，如 GEN.1, PSA.23, JHN.3-5


# ── 个性化计划生成（D1） ──
@router.get("/plan-scopes")
def plan_scopes() -> dict:
    return {"scopes": [{"id": k, "label": v} for k, v in SCOPE_LABELS.items()]}


@router.post("/generate-plan")
def generate_plan_endpoint(body: GeneratePlanBody) -> dict:
    try:
        return generate_plan(body.scope, body.days, body.theme, body.custom_refs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


# ── 计划 ──
@router.get("/plans")
def plans() -> dict:
    return {"plans": loader.list_plans()}


@router.get("/plans/{plan_id}")
def plan_detail(plan_id: str) -> dict:
    if plan_id in loader.READING_PLANS:
        plan = loader.get_reading_plan(plan_id)
        return plan
    if plan_id in loader.PRAYER_PLANS:
        return loader.get_prayer_plan(plan_id)
    raise HTTPException(status_code=404, detail=f"未知计划：{plan_id}")


@router.get("/plans/{plan_id}/day/{day}")
def plan_day(plan_id: str, day: int) -> dict:
    if plan_id in loader.READING_PLANS:
        plan = loader.get_reading_plan(plan_id)
        for row in plan["days"]:
            if row["day"] == day:
                return {"plan_id": plan_id, "type": "reading", **row}
        raise HTTPException(status_code=404, detail="无此天")
    if plan_id in loader.PRAYER_PLANS:
        prayer = loader.get_prayer_plan(plan_id)
        for d in prayer.get("days", []):
            if d.get("day") == day:
                sc = d.get("scripture", {})
                text = loader.resolve_ref_text(
                    sc.get("ref"), sc.get("book"), sc.get("chapter"),
                    sc.get("verse") or sc.get("verse_start"), sc.get("verse_end"),
                )
                return {"plan_id": plan_id, "type": "prayer", **d,
                        "scripture": {**sc, "text": text}}
        raise HTTPException(status_code=404, detail="无此天")
    raise HTTPException(status_code=404, detail=f"未知计划：{plan_id}")


# ── 每日经文 ──
def _resolve_verse_day(day: int | None) -> tuple[int, dict]:
    data = loader.daily_verses()
    verses = data.get("verses", [])
    if not verses:
        raise HTTPException(status_code=404, detail="无每日经文数据")
    if day is None:
        day = (date.today().timetuple().tm_yday - 1) % len(verses) + 1
    item = next((v for v in verses if v.get("day") == day), None)
    if item is None:
        item = verses[(day - 1) % len(verses)]
    return int(item.get("day") or day), item


def _pick_user_code(x_user_code: str | None, x_user_id: str | None) -> str | None:
    for raw in (x_user_code, x_user_id):
        code = (raw or "").strip()
        if is_user_code(code):
            return code
    return None


def _daily_verse_engagement(verse_day: int, user_code: str | None) -> dict:
    try:
        pool = get_pool()
        with pool.connection() as conn:
            likes_row = conn.execute(
                "SELECT COUNT(*)::int FROM daily_verse_like WHERE verse_day = %s",
                (verse_day,),
            ).fetchone()
            likes_count = int(likes_row[0]) if likes_row else 0
            liked = False
            if user_code:
                liked_row = conn.execute(
                    "SELECT 1 FROM daily_verse_like WHERE verse_day = %s AND user_code = %s",
                    (verse_day, user_code),
                ).fetchone()
                liked = liked_row is not None
            shares_row = conn.execute(
                "SELECT COUNT(DISTINCT user_code)::int FROM daily_verse_share WHERE verse_day = %s",
                (verse_day,),
            ).fetchone()
            shares_count = int(shares_row[0]) if shares_row else 0
        return {"likes_count": likes_count, "liked": liked, "shares_count": shares_count}
    except Exception:
        logger.exception("daily verse engagement query failed for day=%s", verse_day)
        return {"likes_count": 0, "liked": False, "shares_count": 0}


def _no_store_headers(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"


@router.get("/daily-verse")
def daily_verse(
    response: Response,
    day: int | None = Query(None, ge=1),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict:
    _no_store_headers(response)
    verse_day, item = _resolve_verse_day(day)
    text = item.get("text") or loader.resolve_ref_text(
        item.get("ref"), item.get("book"), item.get("chapter"),
        item.get("verse_start"), item.get("verse_end"),
    )
    user_code = _pick_user_code(x_user_code, x_user_id)
    stats = _daily_verse_engagement(verse_day, user_code)
    return {**item, "text": text, "day": verse_day, **stats}


@router.post("/daily-verse/like")
def toggle_daily_verse_like(
    response: Response,
    day: int | None = Query(None, ge=1),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict:
    _no_store_headers(response)
    user_code = _pick_user_code(x_user_code, x_user_id)
    if not user_code:
        raise HTTPException(status_code=400, detail="需要 8 位用户标识（X-User-Code）")
    verse_day, _ = _resolve_verse_day(day)
    try:
        pool = get_pool()
        with pool.connection() as conn:
            exists = conn.execute(
                "SELECT 1 FROM daily_verse_like WHERE verse_day = %s AND user_code = %s",
                (verse_day, user_code),
            ).fetchone()
            if exists:
                conn.execute(
                    "DELETE FROM daily_verse_like WHERE verse_day = %s AND user_code = %s",
                    (verse_day, user_code),
                )
                liked = False
            else:
                conn.execute(
                    "INSERT INTO daily_verse_like (verse_day, user_code) VALUES (%s, %s)",
                    (verse_day, user_code),
                )
                liked = True
            conn.commit()
        stats = _daily_verse_engagement(verse_day, user_code)
        return {**stats, "liked": liked}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="点赞服务暂不可用") from exc


@router.post("/daily-verse/share")
def record_daily_verse_share(
    day: int | None = Query(None, ge=1),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict:
    user_code = _pick_user_code(x_user_code, x_user_id) or "anonymous"
    verse_day, _ = _resolve_verse_day(day)
    try:
        pool = get_pool()
        with pool.connection() as conn:
            conn.execute(
                "INSERT INTO daily_verse_share (verse_day, user_code) VALUES (%s, %s)",
                (verse_day, user_code),
            )
            conn.commit()
        stats = _daily_verse_engagement(verse_day, _pick_user_code(x_user_code, x_user_id))
        return {"ok": True, **stats}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="分享记录暂不可用") from exc


def themes() -> dict:
    return {"themes": loader.daily_verses().get("themes", [])}


# ── 今日祷告（ACTS 计划，按年内天序循环） ──
@router.get("/prayer-today")
def prayer_today(day: int | None = Query(None, ge=1)) -> dict:
    prayer = loader.get_prayer_plan()
    days = prayer.get("days", [])
    if not days:
        raise HTTPException(status_code=404, detail="无祷告计划数据")
    if day is None:
        day = (date.today().timetuple().tm_yday - 1) % len(days) + 1
    item = next((d for d in days if d.get("day") == day), days[(day - 1) % len(days)])
    sc = item.get("scripture", {})
    text = loader.resolve_ref_text(
        sc.get("ref"), sc.get("book"), sc.get("chapter"),
        sc.get("verse") or sc.get("verse_start"), sc.get("verse_end"),
    )
    return {
        "plan_id": prayer.get("plan_id", "prayer_acts_30"),
        "model": prayer.get("model"),
        "day": item.get("day"),
        "title": item.get("title"),
        "scripture": {**sc, "text": text},
        "acts": item.get("acts", {}),
        "prompt": item.get("prompt"),
    }


# ── 每日灵修（经文 + 默想 + 祷告，确定性生成，不耗 AI 额度） ──
@router.get("/daily-devotional")
def daily_devotional(day: int | None = Query(None, ge=1)) -> dict:
    item = daily_verse(day=day)
    theme = (item.get("theme") or "").strip()
    ref = item.get("ref") or ""
    theme_part = f"关于「{theme}」" if theme else "这段经文"
    meditation = (
        f"慢慢默读 {ref}。{theme_part}，神想对今天的你说什么？"
        "试着用一句话写下此刻心里被触动的地方。"
    )
    prayer = (
        f"主啊，谢谢你借着 {ref} 提醒我。"
        f"{('求你在' + theme + '上引导我，') if theme else ''}"
        "让我今天带着这节经文去生活，靠你的话语得着力量。阿们。"
    )
    return {
        "day": item.get("day"),
        "verse": {"ref": ref, "text": item.get("text", ""), "theme": theme},
        "meditation": meditation,
        "prayer": prayer,
    }


# ── 交叉引用 ──
@router.get("/crossrefs")
def crossrefs(ref: str = Query(..., description="如 JHN.3.16 / 约翰福音3:16")) -> dict:
    result = loader.crossrefs_for(ref)
    if result is None:
        return {"ref": ref, "related": []}
    return result


# ── 词典 ──
@router.get("/dictionary")
def dictionary(term: str | None = Query(None)) -> dict:
    items = loader.dictionary_entities()
    if term:
        items = [e for e in items if term in e.get("name", "") or term in e.get("summary", "")]
    return {"entities": items}


# ── 插画 ──
@router.get("/illustrations")
def illustrations() -> dict:
    return loader.illustrations_index()


@router.get("/illustrations/{file_name}")
def illustration_file(file_name: str):
    p = loader.illustration_path(file_name)
    if p is None:
        raise HTTPException(status_code=404, detail="无此插画")
    return FileResponse(p, media_type="image/svg+xml")
