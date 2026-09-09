"""小爱深度路由（R1）：问题 + 场景 + surface → 输出形态与篇幅。"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .answer_schema import effective_budget_for_scene

_DEEP_Q = re.compile(
    r"分别|详细|深入|全面|完整|整段|脉络|逐节|每一节|背景.*应用|应用.*背景|"
    r"从背景|历史背景|上下文|结构",
)
_STUDY_Q = re.compile(r"查经预备|讲道|大纲|讨论题|教案|预备查经|预备讲道")
_DEFAULT_EXPLAIN = re.compile(r"^请解读[：:].+$|^请解释[：:].+$")


@dataclass(frozen=True)
class DepthProfile:
    depth: str  # flash | standard | deep | study
    sections: tuple[str, ...]
    section_policy: str  # lead_only | soft | full
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
    """按问题意图与入口决定深度，半屏默认 flash。"""
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

    if scene_id == "verse_quick":
        if span >= 6:
            if wants_deep:
                return _deep_profile(scene_id, span, half=half)
            return _standard_verse_profile(span, deep=True)
        if half or not wants_deep:
            return _flash_profile(span)
        return _standard_verse_profile(span, deep=False)

    if scene_id == "verse_full":
        if half:
            if span <= 1 and (
                _is_default_explain(q) or (not q and not wants_deep)
            ):
                return _flash_profile(span)
            if span >= 6:
                return _deep_profile(scene_id, span, half=True)
            if span <= 5 and not wants_deep:
                return _standard_verse_profile(span, deep=False, compact=True)
            if wants_deep:
                return _deep_profile(scene_id, span, half=True)
            return _standard_verse_profile(span, deep=False, compact=True)
        # Tab / assistant
        if span >= 6 and wants_deep:
            return _deep_profile(scene_id, span, half=False)
        if wants_deep:
            return _standard_verse_profile(span, deep=True)
        return _standard_verse_profile(span, deep=False)

    if scene_id.startswith("chat_"):
        if scene_id in ("chat_study", "chat_preach"):
            return _study_profile(scene_id, span)
        if not wants_expanded_answer(q) and (
            narrow or (len(q) <= 24 and has_prior_turns)
        ):
            return DepthProfile(
                depth="flash",
                sections=("摘要",),
                section_policy="lead_only",
                prefer_prose=True,
                target_chars=180,
                soft_max=260,
                hard_max=320,
                min_complete=70,
            )
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


def _flash_profile(verse_span: int) -> DepthProfile:
    target = 220 if verse_span <= 1 else 280
    return DepthProfile(
        depth="flash",
        sections=("摘要",),
        section_policy="lead_only",
        prefer_prose=True,
        target_chars=target,
        soft_max=target + 60,
        hard_max=target + 100,
        min_complete=70 if verse_span <= 1 else 90,
    )


def _standard_verse_profile(
    verse_span: int,
    *,
    deep: bool,
    compact: bool = False,
) -> DepthProfile:
    if deep and verse_span >= 6:
        sections = ("摘要", "经文背景", "段落脉络", "经文解释")
        target = 720 if verse_span >= 6 else 480
    elif deep:
        sections = ("摘要", "经文背景", "经文解释")
        target = 480
    elif compact or verse_span <= 2:
        sections = ("摘要", "经文解释")
        target = 320
    else:
        sections = ("摘要", "经文背景", "经文解释")
        target = 420
    bud = effective_budget_for_scene("verse_full", verse_span=verse_span)
    bud_total = bud.total_chars if bud else target + 80
    if verse_span >= 6 and not compact:
        soft = bud_total
        target = max(target, min(bud_total - 80, 720 if deep else 620))
    else:
        soft = min(bud_total, target + 120)
    return DepthProfile(
        depth="deep" if deep and verse_span >= 6 else "standard",
        sections=sections,
        section_policy="soft" if compact or not deep else "full",
        prefer_prose=compact,
        target_chars=target,
        soft_max=soft,
        hard_max=soft + (140 if verse_span >= 6 else 120),
        min_complete=120 if verse_span <= 2 else (180 if verse_span >= 6 else 160),
    )


def _deep_profile(scene_id: str, verse_span: int, *, half: bool) -> DepthProfile:
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
        "chat_explain": ("摘要", "背景", "经文解释"),
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
        sections = ("本章概览", "核心内容") if "chapter" in scene_id else ("卷概览", "结构脉络", "核心主题")
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
