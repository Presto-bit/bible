"""小爱 AnswerDocument：done 事件与缓存的统一结构化契约（P0）。"""
from __future__ import annotations

import re

from .parse_output import extract_sections, parse_answer_blocks, split_body_and_followups

DOCUMENT_SCHEMA_VERSION = 3


def section_slug(title: str) -> str:
    base = title.strip().replace(" ", "-")
    safe = re.sub(r"[^\w\u4e00-\u9fff-]", "", base)
    return f"sec-{safe}" if safe else "sec-section"


def build_answer_document(
    body_text: str,
    followups: list[str],
    *,
    blocks_payload: dict | None = None,
    incomplete: bool = False,
    scene: str = "",
) -> dict:
    """从归一化正文构建 AnswerDocument。"""
    if blocks_payload is None:
        blocks_payload = parse_answer_blocks(body_text)
    sections = [
        {"id": section_slug(s["title"]), "title": s["title"]}
        for s in extract_sections(body_text)
    ]
    meta: dict = {"incomplete": incomplete}
    if scene:
        meta["scene"] = scene
    return {
        "schema_version": DOCUMENT_SCHEMA_VERSION,
        "markdown": body_text,
        "sections": sections,
        "followups": followups,
        "lead": blocks_payload.get("lead") or "",
        "blocks": blocks_payload.get("blocks") or [],
        "timeline": blocks_payload.get("timeline") or [],
        "meta": meta,
    }


def build_done_sse_payload(
    text: str,
    *,
    followups: list[str] | None = None,
    incomplete: bool = False,
    scene: str = "",
    document: dict | None = None,
    **extra,
) -> dict:
    """流式结束 / 缓存命中 done 事件的统一 payload。"""
    body_text, parsed_followups = split_body_and_followups(text)
    fu = followups if followups is not None else parsed_followups
    if document is None:
        document = build_answer_document(
            body_text,
            fu,
            incomplete=incomplete,
            scene=scene,
        )
    elif followups is not None:
        document = {**document, "followups": fu}
    payload: dict = {
        "length": len(text),
        "word_count": len(body_text),
        "text": text,
        "sections": document["sections"],
        "followups": fu,
        "lead": document.get("lead") or "",
        "blocks": document.get("blocks") or [],
        "timeline": document.get("timeline") or [],
        "document": document,
    }
    payload.update(extra)
    return payload


def document_from_cache_entry(
    answer: str,
    followups: list[str] | None = None,
    sections: list[dict] | None = None,
    cached_document: dict | None = None,
) -> dict:
    """缓存读取：优先已有 document，旧条目现场重建。"""
    if cached_document and cached_document.get("markdown"):
        return cached_document
    fu = followups or []
    doc = build_answer_document(answer, fu)
    if sections and not doc["sections"]:
        doc["sections"] = [
            {
                "id": section_slug(s.get("title", "")),
                "title": s.get("title", ""),
            }
            for s in sections
            if s.get("title")
        ]
    return doc
