"""小爱回答 Schema：各 scene 字段预算（服务端内部契约）。"""
from __future__ import annotations

from dataclasses import dataclass

SCHEMA_VERSION = 1


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
    "verse_full": ("摘要", "背景", "经文解释"),
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
    if scene in ("verse_full", "verse_quick") and verse_span >= 3:
        cap = min(cap + (verse_span - 2) * 40, cap + 120)
    if scene in ("summary_chapter", "summary_chapter_outline") and verse_span > 20:
        cap = max(cap, 1400)
    return cap


def required_sections(scene: str, *, narrow: bool = False) -> tuple[str, ...]:
    if narrow:
        return NARROW_REQUIRED_SECTIONS
    return REQUIRED_SECTIONS.get(scene, ())


def missing_required_sections(body_text: str, scene: str, *, narrow: bool = False) -> list[str]:
    from .parse_output import extract_sections

    titles = {s["title"] for s in extract_sections(body_text)}
    return [s for s in required_sections(scene, narrow=narrow) if s not in titles]
