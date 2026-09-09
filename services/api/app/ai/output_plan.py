"""小爱 OutputPlan：meta 首包下发预期结构（P1）。"""
from __future__ import annotations

from .answer_schema import (
    SUMMARY_LEAD_TITLES,
    effective_budget_for_scene,
    required_sections,
)


def planned_section_titles(
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
) -> list[str]:
    """与 answer_schema / 续写判定一致的小节顺序。"""
    sections = list(required_sections(scene, narrow=narrow))
    if scene == "verse_full" and verse_span >= 6 and "段落脉络" not in sections:
        insert_at = sections.index("经文解释") if "经文解释" in sections else len(sections)
        sections.insert(insert_at, "段落脉络")
    return sections


def build_output_plan(
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    surface: str = "",
    wants_followups: bool = False,
) -> dict:
    """生成 meta.output_plan，供客户端流式前画骨架。"""
    sections = planned_section_titles(
        scene,
        narrow=narrow,
        verse_span=verse_span,
    )
    bud = effective_budget_for_scene(
        scene,
        narrow=narrow,
        verse_span=verse_span,
    )
    budget_chars = bud.total_chars if bud else 420
    lead = True
    if sections:
        lead = sections[0] in SUMMARY_LEAD_TITLES or sections[0] in {"一句话"}
    max_followups = 0
    if wants_followups:
        max_followups = 2 if surface == "half_sheet" else 3
    return {
        "lead": lead,
        "sections": sections,
        "budget_chars": budget_chars,
        "max_followups": max_followups,
    }
