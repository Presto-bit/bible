"""小爱深度路由（R1）：问题 + 场景 + surface → 输出形态与篇幅。"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .answer_schema import OIA_SECTIONS, effective_budget_for_scene

_DEEP_Q = re.compile(
    r"分别|详细|深入|全面|完整|整段|脉络|逐节|每一节|背景.*应用|应用.*背景|"
    r"从背景|历史背景|上下文|结构",
)
_STUDY_Q = re.compile(r"查经预备|讲道|大纲|讨论题|教案|预备查经|预备讲道")
_DEFAULT_EXPLAIN = re.compile(r"^请解读[：:].+$|^请解释[：:].+$")
_OIA_DEEP_Q = re.compile(r"展开|更多|补充|串珠|关联|应用|背景|词义|原文")
_FULL_OIA_Q = re.compile(
    r"完整解读|OIA\s*四步|摘要.*(?:经文背景|和上下文连|今日回应)"
)


def is_full_oia_request(question: str | None) -> bool:
    q = (question or "").strip()
    return bool(q and (_FULL_OIA_Q.search(q) or _is_default_explain(q)))


@dataclass(frozen=True)
class DepthProfile:
    depth: str  # oia_compact | oia_standard | oia_deep | flash | standard | deep | study
    sections: tuple[str, ...]
    section_policy: str  # lead_only | soft | full | oia
    prefer_prose: bool
    target_chars: int
    soft_max: int
    hard_max: int | None
    min_complete: int


def _is_default_explain(question: str | None) -> bool:
    q = (question or "").strip()
    return bool(q and _DEFAULT_EXPLAIN.match(q))


def is_default_explain(question: str | None) -> bool:
    """公开：是否为默认「请解读/请解释：…」问句。"""
    return _is_default_explain(question)


def wants_expanded_answer(question: str | None) -> bool:
    """追问是否要展开背景/结构/解释（不应走 narrow flash）。"""
    q = (question or "").strip()
    return bool(q and _DEEP_Q.search(q))


def resolve_depth(
    scene_id: str,
    question: str | None,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    surface: str = "",
    has_prior_turns: bool = False,
) -> DepthProfile:
    """按问题意图与入口决定深度；半屏默认 OIA compact。"""
    q = (question or "").strip()
    span = max(1, int(verse_span or 1))
    surf = (surface or "").strip().lower()
    half = surf in {"half_sheet", "prewarm"}

    if scene_id in ("chat_study", "chat_preach", "summary_chapter_outline"):
        return _study_profile(scene_id, span)
    if scene_id == "summary_book":
        return _study_profile(scene_id, span)
    if scene_id in ("summary_chapter",) and span > 20:
        return _deep_profile(scene_id, span, half=half)

    if _STUDY_Q.search(q):
        return _study_profile(scene_id, span)

    wants_deep = bool(_DEEP_Q.search(q))

    if narrow and has_prior_turns and not wants_expanded_answer(q):
        return DepthProfile(
            depth="flash",
            sections=("摘要",),
            section_policy="lead_only",
            prefer_prose=True,
            target_chars=160,
            soft_max=220,
            hard_max=280,
            min_complete=60,
        )

    if scene_id in ("verse_quick", "verse_full"):
        if half:
            return _oia_compact_profile(span)
        if has_prior_turns and is_full_oia_request(q) and not narrow:
            return _oia_supplement_profile()
        if wants_deep and span >= 6:
            return _oia_standard_profile(span, with_outline=True)
        return _oia_standard_profile(span)

    if scene_id.startswith("chat_"):
        if scene_id in ("chat_study", "chat_preach"):
            return _study_profile(scene_id, span)
        if scene_id == "chat_explain":
            if narrow and has_prior_turns and not wants_expanded_answer(q):
                return _narrow_chip_profile()
            if has_prior_turns and is_full_oia_request(q) and not narrow:
                return _oia_supplement_profile()
            if half:
                return _oia_compact_profile(span)
            if wants_deep and span >= 6:
                return _oia_standard_profile(span, with_outline=True)
            return _oia_standard_profile(span)
        if not wants_expanded_answer(q) and (
            narrow or (len(q) <= 28 and has_prior_turns and _OIA_DEEP_Q.search(q))
        ):
            return _narrow_chip_profile()
        if scene_id in ("chat_apply", "chat_understand", "chat_compare", "chat_original"):
            return _standard_chat_profile(scene_id)
        return _standard_chat_profile(scene_id)

    bud = effective_budget_for_scene(scene_id, narrow=narrow, verse_span=span)
    target = bud.total_chars if bud else 420
    return DepthProfile(
        depth="standard",
        sections=tuple(),
        section_policy="soft",
        prefer_prose=False,
        target_chars=target,
        soft_max=target + 80,
        hard_max=target + 160 if bud else None,
        min_complete=80,
    )


def _oia_supplement_profile() -> DepthProfile:
    """Tab 接力后再次「完整解读」：只补细节，不重写四步结构。"""
    return DepthProfile(
        depth="flash",
        sections=("补充说明",),
        section_policy="lead_only",
        prefer_prose=True,
        target_chars=180,
        soft_max=240,
        hard_max=300,
        min_complete=60,
    )


def _narrow_chip_profile() -> DepthProfile:
    return DepthProfile(
        depth="flash",
        sections=("摘要",),
        section_policy="lead_only",
        prefer_prose=True,
        target_chars=160,
        soft_max=200,
        hard_max=240,
        min_complete=60,
    )


def _oia_compact_profile(verse_span: int) -> DepthProfile:
    span = max(1, int(verse_span or 1))
    if span <= 1:
        target, soft, hard, min_c = 260, 320, 360, 180
    elif span <= 5:
        target, soft, hard, min_c = 300, 360, 400, 200
    else:
        target, soft, hard, min_c = 340, 400, 440, 220
    return DepthProfile(
        depth="oia_compact",
        sections=OIA_SECTIONS,
        section_policy="oia",
        prefer_prose=True,
        target_chars=target,
        soft_max=soft,
        hard_max=hard,
        min_complete=min_c,
    )


def _oia_standard_profile(verse_span: int, *, with_outline: bool = False) -> DepthProfile:
    span = max(1, int(verse_span or 1))
    if with_outline:
        sections = ("摘要", "经文背景", "段落脉络", "经文解释", "今日回应")
        target = 680 if span >= 6 else 580
        soft = target + 80
        min_c = 380
        depth = "oia_deep"
        policy = "full"
        prefer_prose = False
    elif span <= 1:
        sections = OIA_SECTIONS
        target, soft, min_c = 500, 600, 320
        depth = "oia_standard"
        policy = "oia"
        prefer_prose = False
    elif span <= 5:
        sections = OIA_SECTIONS
        target, soft, min_c = 580, 680, 360
        depth = "oia_standard"
        policy = "oia"
        prefer_prose = False
    else:
        sections = OIA_SECTIONS
        target, soft, min_c = 650, 780, 400
        depth = "oia_standard"
        policy = "oia"
        prefer_prose = False
    return DepthProfile(
        depth=depth,
        sections=sections,
        section_policy=policy,
        prefer_prose=prefer_prose,
        target_chars=target,
        soft_max=soft,
        hard_max=soft + 120,
        min_complete=min_c,
    )


def _deep_profile(scene_id: str, verse_span: int, *, half: bool) -> DepthProfile:
    """章/卷导读等保留旧 deep 结构。"""
    sections = ("摘要", "经文背景", "段落脉络", "经文解释")
    bud = effective_budget_for_scene(scene_id, verse_span=verse_span)
    target = bud.total_chars if bud else (680 if half else 820)
    return DepthProfile(
        depth="deep",
        sections=sections,
        section_policy="full",
        prefer_prose=False,
        target_chars=target,
        soft_max=target + 60,
        hard_max=target + 140,
        min_complete=200,
    )


def _standard_chat_profile(scene_id: str) -> DepthProfile:
    sections_map = {
        "chat_understand": ("摘要", "经文要旨", "默想引导"),
        "chat_apply": ("摘要", "核心提醒", "具体行动"),
        "chat_compare": ("一句话", "读起来哪里不一样", "可以怎么读"),
        "chat_original": ("一句话", "读起来哪里不一样", "可以怎么读"),
        "chat_general": ("正文",),
        "chat_viewpoints": ("摘要", "观点 A", "观点 B"),
    }
    sections = sections_map.get(scene_id, ("摘要", "正文"))
    bud = effective_budget_for_scene(scene_id)
    target = bud.total_chars if bud else 480
    return DepthProfile(
        depth="standard",
        sections=sections,
        section_policy="soft",
        prefer_prose=scene_id == "chat_general",
        target_chars=target,
        soft_max=target + 100,
        hard_max=target + 200,
        min_complete=100,
    )


def _study_profile(scene_id: str, verse_span: int) -> DepthProfile:
    bud = effective_budget_for_scene(scene_id, verse_span=verse_span)
    target = bud.total_chars if bud else 900
    if scene_id == "chat_preach":
        sections = ("主题", "经文重述", "大纲", "应用")
    elif scene_id.startswith("summary"):
        sections = (
            ("本章概览", "核心内容")
            if "chapter" in scene_id
            else ("卷概览", "结构脉络", "核心主题")
        )
    else:
        sections = ("背景", "结构大纲", "讨论问题")
    return DepthProfile(
        depth="study",
        sections=sections,
        section_policy="full",
        prefer_prose=False,
        target_chars=target,
        soft_max=target + 120,
        hard_max=target + 240,
        min_complete=200,
    )
