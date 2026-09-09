"""小爱回答 Schema：各 scene 字段预算（服务端内部契约）。"""
from __future__ import annotations

from dataclasses import dataclass

SCHEMA_VERSION = 3


@dataclass(frozen=True)
class SceneBudget:
    total_chars: int
    max_tokens: int
    summary_max: int
    item_max: int
    min_bullets: int = 2
    max_bullets: int = 5


SCENE_BUDGETS: dict[str, SceneBudget] = {
    "verse_quick": SceneBudget(
        total_chars=260,
        max_tokens=650,
        summary_max=40,
        item_max=55,
        min_bullets=3,
        max_bullets=4,
    ),
    "verse_full": SceneBudget(
        total_chars=360,
        max_tokens=900,
        summary_max=40,
        item_max=55,
        min_bullets=2,
        max_bullets=4,
    ),
    "chat_explain": SceneBudget(
        total_chars=420,
        max_tokens=1024,
        summary_max=40,
        item_max=60,
        min_bullets=2,
        max_bullets=4,
    ),
    "chat_understand": SceneBudget(
        total_chars=420,
        max_tokens=1024,
        summary_max=40,
        item_max=60,
        min_bullets=2,
        max_bullets=4,
    ),
    "chat_apply": SceneBudget(
        total_chars=380,
        max_tokens=1024,
        summary_max=40,
        item_max=60,
        min_bullets=2,
        max_bullets=4,
    ),
    "chat_study": SceneBudget(
        total_chars=900,
        max_tokens=1400,
        summary_max=50,
        item_max=70,
        min_bullets=2,
        max_bullets=6,
    ),
    "chat_preach": SceneBudget(
        total_chars=900,
        max_tokens=1400,
        summary_max=50,
        item_max=70,
        min_bullets=2,
        max_bullets=6,
    ),
    "chat_compare": SceneBudget(
        total_chars=420,
        max_tokens=1100,
        summary_max=40,
        item_max=60,
        min_bullets=2,
        max_bullets=4,
    ),
    "chat_original": SceneBudget(
        total_chars=420,
        max_tokens=1100,
        summary_max=40,
        item_max=60,
        min_bullets=2,
        max_bullets=4,
    ),
    "chat_general": SceneBudget(
        total_chars=720,
        max_tokens=1600,
        summary_max=40,
        item_max=70,
        min_bullets=2,
        max_bullets=6,
    ),
    "chat_viewpoints": SceneBudget(
        total_chars=640,
        max_tokens=1800,
        summary_max=50,
        item_max=70,
        min_bullets=2,
        max_bullets=5,
    ),
    "summary_chapter": SceneBudget(
        total_chars=500,
        max_tokens=1200,
        summary_max=40,
        item_max=65,
        min_bullets=3,
        max_bullets=6,
    ),
    "summary_chapter_outline": SceneBudget(
        total_chars=480,
        max_tokens=1600,
        summary_max=40,
        item_max=65,
        min_bullets=3,
        max_bullets=6,
    ),
    "summary_book": SceneBudget(
        total_chars=700,
        max_tokens=1200,
        summary_max=60,
        item_max=70,
        min_bullets=3,
        max_bullets=6,
    ),
}

NARROW_BUDGET = SceneBudget(
    total_chars=180,
    max_tokens=400,
    summary_max=30,
    item_max=50,
    min_bullets=2,
    max_bullets=3,
)

HISTORY_CHAT_MAX_TOKENS = 700

# 允许散文段（非 bullets）的小节 — 主题问答正文等
PROSE_SECTION_TITLES = frozenset(
    {
        "正文",
        "结构脉络",
        "卷概览",
        "本章概览",
        "一句话",
        "读起来哪里不一样",
        "原文帮你抓重点",
        "可以怎么读",
        "共同点",
        "建议你怎么读",
        "结论与回应",
        "主题句",
        "经文重述",
    }
)

SUMMARY_LEAD_TITLES = frozenset({"摘要", "本章概览", "卷概览", "主题句", "一句话"})

REQUIRED_SECTIONS: dict[str, tuple[str, ...]] = {
    "verse_quick": ("摘要", "经文解释"),
    "verse_full": ("摘要", "经文背景", "经文解释"),
    "chat_explain": ("摘要", "背景", "经文解释"),
    "chat_understand": ("摘要", "经文要旨", "默想引导"),
    "chat_apply": ("摘要", "核心提醒", "具体行动"),
    "chat_compare": ("一句话", "读起来哪里不一样", "可以怎么读"),
    "chat_original": ("一句话", "读起来哪里不一样", "可以怎么读"),
    "summary_chapter": ("本章概览", "核心内容"),
    "summary_chapter_outline": ("本章概览", "分段要点", "读经提示"),
    "summary_book": ("卷概览", "结构脉络", "核心主题", "读经提示"),
}

NARROW_REQUIRED_SECTIONS: tuple[str, ...] = ("摘要",)


def budget_for_scene(scene: str, *, narrow: bool = False) -> SceneBudget | None:
    if narrow:
        return NARROW_BUDGET
    return SCENE_BUDGETS.get(scene)


def effective_budget_for_scene(
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
) -> SceneBudget | None:
    """半屏释经：多节选段按 span 放大字数与 bullets 上限。"""
    bud = budget_for_scene(scene, narrow=narrow)
    if not bud or scene not in ("verse_full", "verse_quick"):
        return bud
    span = max(1, int(verse_span or 1))
    if span <= 2:
        return bud
    if span <= 5:
        if scene == "verse_full":
            return SceneBudget(
                total_chars=480,
                max_tokens=bud.max_tokens,
                summary_max=42,
                item_max=58,
                min_bullets=bud.min_bullets,
                max_bullets=5,
            )
        return SceneBudget(
            total_chars=340,
            max_tokens=bud.max_tokens,
            summary_max=40,
            item_max=55,
            min_bullets=bud.min_bullets,
            max_bullets=5,
        )
    if scene == "verse_full":
        total_chars = 820 if span >= 6 else 480
        if span >= 9:
            total_chars = 920
        return SceneBudget(
            total_chars=total_chars,
            max_tokens=bud.max_tokens,
            summary_max=50,
            item_max=78,
            min_bullets=2,
            max_bullets=5,
        )
    return SceneBudget(
        total_chars=420,
        max_tokens=bud.max_tokens,
        summary_max=42,
        item_max=58,
        min_bullets=3,
        max_bullets=5,
    )


def verse_min_chars(scene: str, verse_span: int = 1) -> int:
    span = max(1, int(verse_span or 1))
    if scene == "verse_full":
        if span <= 2:
            return 70
        if span <= 5:
            return 90 + max(0, span - 2) * 15
        return 140 + span * 22
    if scene == "verse_quick":
        if span <= 2:
            return 45
        if span <= 5:
            return 55 + max(0, span - 2) * 12
        return 55 + (span - 1) * 18
    return 80


def verse_min_explain_bullets(verse_span: int = 1) -> int:
    span = max(1, int(verse_span or 1))
    if span <= 2:
        return 2
    if span <= 5:
        return 3
    return 4


def verse_min_outline_bullets(verse_span: int = 1) -> int:
    return 3 if max(1, int(verse_span or 1)) >= 6 else 0


def verse_min_background_bullets(verse_span: int = 1) -> int:
    span = max(1, int(verse_span or 1))
    if span >= 6:
        return 2
    if span >= 3:
        return 2
    return 1


def verse_explain_max_bullets(verse_span: int = 1) -> int:
    span = max(1, int(verse_span or 1))
    if span >= 6:
        return 5
    if span >= 3:
        return 4
    return 4


def verse_max_background_bullets(verse_span: int = 1) -> int:
    span = max(1, int(verse_span or 1))
    if span >= 6:
        return 2
    if span >= 3:
        return 3
    return 2


def verse_max_outline_bullets(verse_span: int = 1) -> int:
    return 4 if max(1, int(verse_span or 1)) >= 6 else 3


def section_bullet_cap(title: str, verse_span: int = 1) -> int | None:
    """各小节 bullets 硬上限（归一化裁剪）。"""
    canonical = "经文背景" if title == "背景" else title
    span = max(1, int(verse_span or 1))
    caps: dict[str, int] = {
        "经文背景": verse_max_background_bullets(span),
        "段落脉络": verse_max_outline_bullets(span),
        "经文解释": verse_explain_max_bullets(span),
    }
    return caps.get(canonical)


VERSE_BACKGROUND_TITLES = frozenset({"背景", "经文背景"})


def verse_has_background(titles: set[str]) -> bool:
    return bool(titles & VERSE_BACKGROUND_TITLES)


def verse_passage_structure_ok(
    titles: set[str],
    *,
    verse_span: int,
    require_outline: bool | None = None,
) -> bool:
    span = max(1, int(verse_span or 1))
    if not verse_has_background(titles):
        return False
    need_outline = require_outline if require_outline is not None else span >= 6
    if need_outline:
        return "段落脉络" in titles
    return True


def verse_context_section_ok(titles: set[str], *, verse_span: int) -> bool:
    """兼容旧调用：多节须同时有经文背景与段落脉络。"""
    return verse_passage_structure_ok(titles, verse_span=verse_span)


def max_tokens_for_scene(
    scene: str,
    *,
    narrow: bool = False,
    has_prior_turns: bool = False,
    verse_span: int = 1,
) -> int:
    bud = budget_for_scene(scene, narrow=narrow)
    if not bud:
        return 1024
    cap = bud.max_tokens
    if narrow:
        return cap
    if has_prior_turns and scene.startswith("chat_"):
        cap = min(cap, HISTORY_CHAT_MAX_TOKENS)
    if scene in ("verse_full", "verse_quick"):
        span = max(1, int(verse_span or 1))
        if span >= 3:
            bonus = min((span - 2) * 40, 280 if span >= 9 else (200 if span >= 6 else 120))
            cap = cap + bonus
    if scene in ("summary_chapter", "summary_chapter_outline") and verse_span > 20:
        cap = max(cap, 1400)
    return cap


def required_sections(scene: str, *, narrow: bool = False) -> tuple[str, ...]:
    if narrow:
        return NARROW_REQUIRED_SECTIONS
    return REQUIRED_SECTIONS.get(scene, ())


def missing_required_sections(
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
) -> list[str]:
    from .parse_output import extract_sections

    titles = {s["title"] for s in extract_sections(body_text)}
    missing: list[str] = []
    for section in required_sections(scene, narrow=narrow):
        if section == "经文背景":
            if not verse_has_background(titles):
                missing.append(section)
        elif section not in titles:
            missing.append(section)
    span = max(1, int(verse_span or 1))
    if scene == "verse_full" and span >= 6 and "段落脉络" not in titles:
        missing.append("段落脉络")
    return missing
