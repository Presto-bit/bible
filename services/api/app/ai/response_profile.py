"""小爱回答呈现画像：客户端选版式 / TOC / 块渲染。"""
from __future__ import annotations

from .structure_assets import wants_timeline_profile

LEAD_SECTION_SCENES = frozenset(
    {
        "verse_full",
        "chat_explain",
        "chat_understand",
        "chat_general",
    }
)


def resolve_response_profile(
    scene_id: str,
    *,
    reader_context: dict | None = None,
    has_rag: bool = False,
    question: str | None = None,
    structure_assets: list[dict] | None = None,
) -> str:
    ctx = reader_context or {}
    compare = ctx.get("compare_versions") or []
    has_dual_compare = isinstance(compare, list) and len(compare) >= 2
    assets = structure_assets or []

    if assets and any(a.get("kind") in ("timeline", "graph", "diagram") for a in assets):
        if wants_timeline_profile(scene_id, question=question, structure_assets=assets):
            return "timeline_rail"
        return "structure_map"
    if scene_id in ("chat_compare", "chat_original") and has_dual_compare:
        return "side_compare"
    if scene_id == "chat_viewpoints":
        return "viewpoint_stack"
    if scene_id == "chat_apply":
        return "apply_steps"
    if scene_id in ("verse_quick", "summary_chapter"):
        return "bullet_rail"
    if scene_id == "summary_chapter_outline":
        return "chapter_outline"
    if scene_id in ("chat_study", "chat_preach"):
        return "study_sheet"
    if wants_timeline_profile(scene_id, question=question):
        return "timeline_rail"
    if scene_id in LEAD_SECTION_SCENES:
        return "lead_sections"
    if scene_id == "summary_book":
        return "chapter_outline"
    return "lead_sections"
