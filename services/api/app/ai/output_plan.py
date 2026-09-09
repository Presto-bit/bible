"""小爱 OutputPlan：meta 首包下发预期结构（P1 + R1 depth）。"""
from __future__ import annotations

from .answer_schema import SUMMARY_LEAD_TITLES
from .depth_router import DepthProfile, resolve_depth


def planned_section_titles(
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    depth: DepthProfile | None = None,
) -> list[str]:
    """与 depth / answer_schema 一致的小节顺序。"""
    if depth is not None:
        return list(depth.sections)
    prof = resolve_depth(
        scene,
        None,
        narrow=narrow,
        verse_span=verse_span,
    )
    return list(prof.sections)


def depth_kwargs_from_plan(plan: dict | None) -> dict:
    """从 meta.output_plan 提取 depth 相关参数（R2）。"""
    if not plan:
        return {}
    sections = plan.get("sections") or []
    return {
        "depth": plan.get("depth"),
        "soft_max": plan.get("soft_max_chars"),
        "prefer_prose": bool(plan.get("prefer_prose")),
        "expected_sections": tuple(sections) if sections else None,
        "min_complete": plan.get("min_complete"),
    }


def build_output_plan(
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    surface: str = "",
    wants_followups: bool = False,
    question: str | None = None,
    depth: DepthProfile | None = None,
) -> dict:
    """生成 meta.output_plan，供客户端流式前画骨架。"""
    prof = depth or resolve_depth(
        scene,
        question,
        narrow=narrow,
        verse_span=verse_span,
        surface=surface,
    )
    sections = list(prof.sections)
    budget_chars = prof.target_chars
    lead = True
    if sections:
        lead = sections[0] in SUMMARY_LEAD_TITLES or sections[0] in {"一句话", "主题"}
    max_followups = 0
    if wants_followups and prof.depth not in ("flash",):
        max_followups = 2 if surface == "half_sheet" else 3
    return {
        "depth": prof.depth,
        "section_policy": prof.section_policy,
        "prefer_prose": prof.prefer_prose,
        "lead": lead,
        "sections": sections,
        "budget_chars": budget_chars,
        "soft_max_chars": prof.soft_max,
        "min_complete": prof.min_complete,
        "max_followups": max_followups,
    }
