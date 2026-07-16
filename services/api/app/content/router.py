"""静态内容接口。经库可解析时填充经文正文。"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..auth.user_code import is_user_code
from ..db import get_pool
from . import loader
from .daily_clock import china_today, verse_day_for_date
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
        day = verse_day_for_date(china_today(), len(verses))
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


def _daily_verse_payload(day: int | None) -> dict:
    """每日经文正文（与 /daily-verse 相同逻辑，供灵修等接口复用）。"""
    verse_day, item = _resolve_verse_day(day)
    text = loader.resolve_ref_text(
        item.get("ref"), item.get("book"), item.get("chapter"),
        item.get("verse_start"), item.get("verse_end"),
        version="cuvs",
        fallback=False,
    )
    version = "cuvs"
    if not text:
        text = loader.resolve_ref_text(
            item.get("ref"), item.get("book"), item.get("chapter"),
            item.get("verse_start"), item.get("verse_end"),
            version="cnv",
            fallback=False,
        )
        version = "cnv"
    text = (text or "").strip()
    return {**item, "text": text, "day": verse_day, "version": version}


@router.get("/daily-verse")
def daily_verse(
    response: Response,
    day: int | None = Query(None, ge=1),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict:
    _no_store_headers(response)
    payload = _daily_verse_payload(day)
    user_code = _pick_user_code(x_user_code, x_user_id)
    stats = _daily_verse_engagement(payload["day"], user_code)
    return {**payload, **stats}


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
    data = loader.daily_verses()
    verses = data.get("verses") or []
    return {
        "count": data.get("count") or len(verses),
        "themes": data.get("themes", []),
    }


@router.get("/themes")
def themes_endpoint() -> dict:
    return themes()


@router.get("/topics")
def topics(topic: str | None = Query(None)) -> dict:
    if topic:
        t = loader.topic_by_id(topic)
        if not t:
            raise HTTPException(status_code=404, detail=f"未知主题：{topic}")
        refs = []
        for rr in t.get("refs", []):
            refs.append({"ref": rr, "text": loader.resolve_ref_text(rr, None, None, None, None)})
        return {**t, "refs": refs}
    return loader.topics_index()


@router.get("/attribution")
def attribution() -> dict:
    return loader.content_attribution()


# ── 祷告计划当日内容（按 plan_id + day；未指定则默认 ACTS 并按年内天序） ──
@router.get("/prayer-today")
def prayer_today(
    day: int | None = Query(None, ge=1),
    plan_id: str | None = Query(None),
) -> dict:
    pid = (plan_id or "prayer_acts_30").strip()
    try:
        prayer = loader.get_prayer_plan(pid)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"未知祷告计划：{pid}") from exc
    days = prayer.get("days", [])
    if not days:
        raise HTTPException(status_code=404, detail="无祷告计划数据")
    if day is None:
        day = verse_day_for_date(china_today(), len(days))
    item = next((d for d in days if d.get("day") == day), days[(day - 1) % len(days)])
    sc = item.get("scripture", {})
    text = loader.resolve_ref_text(
        sc.get("ref"), sc.get("book"), sc.get("chapter"),
        sc.get("verse") or sc.get("verse_start"), sc.get("verse_end"),
    )
    return {
        "plan_id": prayer.get("plan_id", pid),
        "plan_title": prayer.get("title"),
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
    item = _daily_verse_payload(day)
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
def dictionary(
    term: str | None = Query(None),
    ref: str | None = Query(None, description="经文坐标，用于同名消歧排序"),
) -> dict:
    items = loader.dictionary_lookup(term, ref)
    return {"entities": items}


# ── 段落标题 ──
@router.get("/sections")
def sections(
    book: str | None = Query(None),
    chapter: int | None = Query(None, ge=1),
) -> dict:
    if book and chapter:
        return {"sections": loader.section_titles(book, chapter)}
    return {"chapters": loader.section_titles_index()}


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


# ── Strong's / 原文 ──
@router.get("/strongs")
def strongs(
    ref: str = Query(..., description="如 JHN.3.16"),
    strongs_id: str | None = Query(None, alias="id"),
) -> dict:
    if strongs_id:
        entry = loader.strongs_lookup(strongs_id)
        if entry is None:
            raise HTTPException(status_code=404, detail=f"无 Strong 编号：{strongs_id}")
        return {"entry": entry}
    result = loader.strongs_for_ref(ref)
    if result is None:
        return {"ref": ref, "words": []}
    return result


# ── 地理 / 时间线 ──
@router.get("/geography")
def geography(
    ref: str | None = Query(None, description="经文坐标，返回相关地点"),
    book: str | None = Query(None, description="书卷 id，与 chapter 合用筛本章地点"),
    chapter: int | None = Query(None, ge=1),
) -> dict:
    if book and chapter:
        return {"places": loader.places_for_chapter(book, chapter)}
    places = loader.geography_places()
    if ref:
        r = loader.dictionary_lookup(ref=ref)
        place_names = {e.get("name") for e in r if e.get("type") == "place"}
        places = [p for p in places if p.get("name") in place_names]
    return {"places": places[:50]}


@router.get("/timeline")
def timeline(
    book: str | None = Query(None),
    chapter: int | None = Query(None, ge=1),
) -> dict:
    if book and chapter:
        row = loader.timeline_for(book, chapter)
        return {"timeline": row}
    return {"chapters": loader.timeline_chapters()}


@router.get("/map-tours")
def map_tours_list() -> dict:
    return {"tours": loader.map_tours()}


@router.get("/map-tours/{tour_id}")
def map_tour_detail(tour_id: str) -> dict:
    for tour in loader.map_tours():
        if tour.get("id") == tour_id:
            places = loader.geography_places()
            by_id = {p.get("id"): p for p in places}
            stops = []
            for stop in tour.get("stops") or []:
                pid = stop.get("place_id")
                stops.append({**stop, "place": by_id.get(pid)})
            return {"tour": {**tour, "stops": stops}}
    raise HTTPException(status_code=404, detail=f"无地图专题：{tour_id}")


@router.get("/timeline-tours")
def timeline_tours_list() -> dict:
    return {"tours": loader.timeline_tours()}


@router.get("/timeline-tours/{tour_id}")
def timeline_tour_detail(tour_id: str) -> dict:
    for tour in loader.timeline_tours():
        if tour.get("id") == tour_id:
            return {"tour": tour}
    raise HTTPException(status_code=404, detail=f"无时间线专题：{tour_id}")


@router.get("/summaries/books")
def summaries_books() -> dict:
    return {"books": loader.book_summaries()}


@router.get("/summaries/books/{book}")
def summary_book(book: str) -> dict:
    row = loader.summary_for_book(book)
    if row is None:
        raise HTTPException(status_code=404, detail=f"无经卷摘要：{book}")
    return {"summary": row}


@router.get("/summaries/chapters")
def summaries_chapters(
    book: str = Query(..., description="书卷 id"),
    chapter: int | None = Query(None, ge=1),
) -> dict:
    if chapter:
        row = loader.summary_for_chapter(book, chapter)
        return {"summary": row}
    items = [
        r for r in loader.chapter_summaries()
        if r.get("book") == book.upper()
    ]
    return {"chapters": items}


@router.get("/graph-topics")
def graph_topics_list() -> dict:
    return {"topics": loader.graph_topics()}


@router.get("/graph-topics/{topic_id}")
def graph_topic_detail(topic_id: str) -> dict:
    for topic in loader.graph_topics():
        if topic.get("id") == topic_id:
            nodes = []
            edges = []
            seen_edges: set[str] = set()
            for eid in topic.get("entity_ids") or []:
                g = loader.relations_graph_for_entity(eid)
                if g.get("center"):
                    nodes.append({
                        "id": g["center"].get("id"),
                        "name": g["center"].get("name"),
                        "type": g["center"].get("type"),
                    })
                for edge in g.get("edges") or []:
                    key = f"{edge.get('from')}-{edge.get('to')}-{edge.get('type')}"
                    if key in seen_edges:
                        continue
                    seen_edges.add(key)
                    edges.append(edge)
                for n in g.get("nodes") or []:
                    if not any(x.get("id") == n.get("id") for x in nodes):
                        nodes.append(n)
            return {"topic": topic, "graph": {"nodes": nodes, "edges": edges}}
    raise HTTPException(status_code=404, detail=f"无关系专题：{topic_id}")


@router.get("/relations")
def relations(entity_id: str | None = Query(None)) -> dict:
    if entity_id:
        return loader.relations_graph_for_entity(entity_id)
    return {"relations": loader.entity_relations()}


@router.get("/entities/{entity_id}/knowledge")
def entity_knowledge(entity_id: str, graph_limit: int = 12) -> dict:
    limit = max(1, min(int(graph_limit), 50))
    data = loader.entity_knowledge(entity_id, graph_limit=limit)
    if data is None:
        raise HTTPException(status_code=404, detail=f"无词条：{entity_id}")
    return data


@router.get("/diagrams")
def diagrams_list() -> dict:
    return loader.diagrams_catalog()


@router.get("/diagrams/{diagram_id}")
def diagram_detail(diagram_id: str):
    item = loader.diagram_by_id(diagram_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"无图鉴：{diagram_id}")
    return {"diagram": item}


@router.get("/diagrams/{diagram_id}/file")
def diagram_file(diagram_id: str):
    item = loader.diagram_by_id(diagram_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"无图鉴：{diagram_id}")
    p = loader.diagram_file_path(item.get("file") or "")
    if p is None:
        raise HTTPException(status_code=404, detail="图鉴文件缺失")
    return FileResponse(p, media_type="image/svg+xml; charset=utf-8")


# ── 首页 Hero B 运营位 ──

from pathlib import Path

from ..admin.auth import verify_admin_token
from ..admin.hero_b_ops import hero_b_assets_dir, pick_active_campaign
from .hero_b_link import LINK_CATALOG


def _is_admin_request(authorization: str | None = Header(default=None, alias="Authorization")) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    return verify_admin_token(token) is not None


@router.get("/hero-b/assets/{filename}")
def hero_b_asset(filename: str):
    safe = Path(filename).name
    if safe != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="无效文件名")
    path = hero_b_assets_dir() / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    media = "image/webp" if safe.endswith(".webp") else "image/jpeg"
    if safe.endswith(".png"):
        media = "image/png"
    return FileResponse(path, media_type=media)


@router.get("/group-task/assets/{filename}")
def group_task_asset(filename: str):
    from ..social.task_ops import task_attachments_dir

    safe = Path(filename).name
    if safe != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="无效文件名")
    path = task_attachments_dir() / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    media = "application/octet-stream"
    lower = safe.lower()
    if lower.endswith((".jpg", ".jpeg")):
        media = "image/jpeg"
    elif lower.endswith(".png"):
        media = "image/png"
    elif lower.endswith(".webp"):
        media = "image/webp"
    elif lower.endswith(".pdf"):
        media = "application/pdf"
    return FileResponse(path, media_type=media)


@router.get("/social-media/assets/{filename}")
def social_media_asset(filename: str):
    from ..social.blob_store import get_blob_store

    safe = Path(filename).name
    if safe != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="无效文件名")
    store = get_blob_store()
    try:
        data = store.read_bytes(safe)
    except Exception:
        raise HTTPException(status_code=404, detail="文件不存在") from None
    media = "application/octet-stream"
    lower = safe.lower()
    if lower.endswith((".jpg", ".jpeg")):
        media = "image/jpeg"
    elif lower.endswith(".png"):
        media = "image/png"
    elif lower.endswith((".webp",)):
        media = "image/webp"
    elif lower.endswith(".gif"):
        media = "image/gif"
    elif lower.endswith(".pdf"):
        media = "application/pdf"
    elif lower.endswith((".txt", ".md", ".csv")):
        media = "text/plain; charset=utf-8"
    return Response(content=data, media_type=media, headers={"Cache-Control": "private, max-age=3600"})


@router.get("/home/bootstrap")
def home_bootstrap(
    response: Response,
    request: Request,
    preview_campaign_id: str | None = Query(None),
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> dict:
    """每日经文 + Hero B 活动（合并首页首屏请求）。"""
    _no_store_headers(response)
    # 首页必经路径内联记 UV，避免仅依赖中间件 / 未反代的 /analytics
    try:
        from ..analytics.uv import record_daily_visit
        from ..auth.user_code import pick_user_code, uuid_for_code

        code = pick_user_code(x_user_code, x_user_id)
        uid = uuid_for_code(code) if code else None
        device = (x_device_id or x_guest_id or "").strip() or None
        if not device and not uid:
            forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
            if forwarded:
                device = f"ip:{forwarded[:64]}"
            elif request.client and request.client.host:
                device = f"ip:{request.client.host[:64]}"
        record_daily_visit(user_id=uid, device_id=device)
    except Exception:
        pass
    payload = _daily_verse_payload(None)
    user_code = _pick_user_code(x_user_code, x_user_id)
    stats = _daily_verse_engagement(payload["day"], user_code)
    admin_preview = _is_admin_request(authorization)
    campaign = pick_active_campaign(
        admin_preview=admin_preview,
        preview_campaign_id=preview_campaign_id,
    )
    return {
        "dailyVerse": {**payload, **stats},
        "heroBCampaign": campaign,
    }


@router.post("/uv-visit")
def content_uv_visit(
    request: Request,
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_device_id: str | None = Header(default=None, alias="X-Device-Id"),
    x_guest_id: str | None = Header(default=None, alias="X-Guest-Id"),
) -> dict:
    """UV 心跳（走已反代的 /content，兼容未加 analytics 的 Nginx）。"""
    from ..analytics.uv import record_daily_visit, uv_last_error
    from ..auth.user_code import pick_user_code, uuid_for_code
    from ..time_cn import china_today

    code = pick_user_code(x_user_code, x_user_id)
    uid = uuid_for_code(code) if code else None
    device = (x_device_id or x_guest_id or "").strip() or None
    if not device and not uid:
        forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        if forwarded:
            device = f"ip:{forwarded[:64]}"
        elif request.client and request.client.host:
            device = f"ip:{request.client.host[:64]}"
    ok = record_daily_visit(user_id=uid, device_id=device)
    return {
        "ok": ok,
        "day": china_today().isoformat(),
        "error": None if ok else uv_last_error(),
    }


@router.get("/hero-b/link-catalog")
def hero_b_link_catalog() -> dict:
    return {"catalog": LINK_CATALOG}
