"""首页 Hero B 结构化链接 → href 解析。"""
from __future__ import annotations

from typing import Any
from urllib.parse import quote

TAB_PATHS: dict[str, str] = {
    "home": "/",
    "reader": "/reader",
    "discover": "/discover",
    "challenge": "/challenge",
    "assistant": "/assistant",
    "profile": "/profile",
}

LINK_CATALOG: dict[str, Any] = {
    "tabs": [
        {"id": "home", "label": "首页"},
        {"id": "reader", "label": "读经"},
        {"id": "discover", "label": "发现"},
        {"id": "challenge", "label": "闯关"},
        {"id": "assistant", "label": "小爱"},
        {"id": "profile", "label": "我的"},
    ],
    "maps": [
        {"id": "exodus-wilderness", "label": "出埃及 · 旷野行程"},
        {"id": "paul-first-journey", "label": "保罗第一次宣教"},
        {"id": "jesus-ministry-galilee", "label": "耶稣加利利事工"},
    ],
    "timelines": [
        {"id": "life-of-jesus", "label": "耶稣生平"},
        {"id": "kings-of-judah", "label": "犹大诸王"},
    ],
    "diagrams": [
        {"id": "tabernacle-layout", "label": "会幕布局"},
        {"id": "ark-of-covenant", "label": "约柜"},
        {"id": "temple-layout", "label": "圣殿布局"},
        {"id": "passover-door", "label": "逾越节门楣"},
    ],
    "graphs": [
        {"id": "exodus-core", "label": "出埃及核心人物"},
        {"id": "patriarchs", "label": "族长与后裔"},
        {"id": "paul-companions", "label": "保罗与同工"},
    ],
    "discoverViews": [
        {"id": "home", "label": "发现首页"},
        {"id": "join", "label": "加入群组"},
    ],
}


class HeroBLinkError(ValueError):
    pass


def resolve_hero_b_href(link: dict[str, Any]) -> str:
    if not link or not isinstance(link, dict):
        raise HeroBLinkError("link 无效")
    kind = str(link.get("kind") or "").strip()
    params = link.get("params") if isinstance(link.get("params"), dict) else {}

    if kind == "tab":
        tab = str(params.get("tab") or "home")
        href = TAB_PATHS.get(tab)
        if not href:
            raise HeroBLinkError(f"未知 tab: {tab}")
        return href

    if kind == "reader":
        book = str(params.get("book") or "GEN").strip()
        chapter = int(params.get("chapter") or 1)
        if chapter < 1:
            raise HeroBLinkError("chapter 无效")
        return f"/reader?book={quote(book)}&chapter={chapter}"

    if kind == "challenge":
        return "/challenge"

    if kind == "assistant":
        return "/assistant"

    if kind == "plans":
        plan_id = params.get("planId")
        if plan_id:
            return f"/plans?plan={quote(str(plan_id))}"
        return "/plans"

    if kind == "map":
        tour_id = str(params.get("tourId") or "").strip()
        if not tour_id:
            raise HeroBLinkError("缺少 tourId")
        return f"/search/map/{quote(tour_id)}"

    if kind == "timeline":
        tour_id = str(params.get("tourId") or "").strip()
        if not tour_id:
            raise HeroBLinkError("缺少 tourId")
        return f"/search/timeline/{quote(tour_id)}"

    if kind == "diagram":
        diagram_id = str(params.get("diagramId") or "").strip()
        if not diagram_id:
            raise HeroBLinkError("缺少 diagramId")
        return f"/search/diagrams/{quote(diagram_id)}"

    if kind == "graph":
        topic_id = str(params.get("topicId") or "").strip()
        if not topic_id:
            raise HeroBLinkError("缺少 topicId")
        return f"/search/graph/{quote(topic_id)}"

    if kind == "discover":
        view = str(params.get("view") or "home")
        if view == "join":
            return "/discover/join"
        if view == "group":
            group_id = str(params.get("groupId") or "").strip()
            if not group_id:
                raise HeroBLinkError("缺少 groupId")
            return f"/discover/group/{quote(group_id)}"
        return "/discover"

    if kind == "path":
        path = str(params.get("path") or "").strip()
        if not path.startswith("/") or path.startswith("//"):
            raise HeroBLinkError("path 必须以 / 开头")
        return path

    raise HeroBLinkError(f"未知 link.kind: {kind}")
