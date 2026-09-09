"""小爱 section_fill：流后单次补形（P2 + R3 depth 分策略）。"""
from __future__ import annotations

import logging

from .answer_normalize import is_prose_wall
from .answer_schema import missing_required_sections
from .llm import complete_chat
from .parse_output import (
    answer_ends_abruptly,
    mid_bullet_truncated,
    missing_summary_sections,
    missing_verse_sections,
    summary_incomplete,
    verse_explain_incomplete,
)

logger = logging.getLogger(__name__)

_FILL_TOKENS = {
    "intent": 380,
    "structure": 620,
    "full": 900,
}


def _fill_mode(depth: str | None) -> str:
    """R3：flash 不 fill；standard 只补 intent；deep 补结构；study 全量 repair。"""
    if depth == "flash":
        return "none"
    if depth == "study":
        return "full"
    if depth == "deep":
        return "structure"
    return "intent"


def _truncation_hint(text: str) -> str | None:
    if answer_ends_abruptly(text) or mid_bullet_truncated(text):
        return "正文在句中被截断，请从中断处续写并自然收束，勿重复"
    return None


def _fill_token_cap(depth: str | None, requested: int) -> int:
    mode = _fill_mode(depth)
    cap = _FILL_TOKENS.get(mode, 380)
    return min(requested, cap)


def collect_section_fill_hints(
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    depth: str | None = None,
    planned_sections: tuple[str, ...] | None = None,
    min_complete: int | None = None,
) -> list[str]:
    """汇总一次补形所需提示；空列表表示无需 section_fill。"""
    mode = _fill_mode(depth)
    if mode == "none":
        return []
    text = body_text.strip()
    if not text:
        return ["补写完整回答，保持 ### 中文标题与 - 列表格式"]
    hints: list[str] = []
    missing: list[str] = []

    if scene in ("verse_full", "verse_quick"):
        for title in missing_verse_sections(
            scene,
            text,
            verse_span=verse_span,
            expected_sections=planned_sections,
        ):
            if title not in missing:
                missing.append(title)
        if mode == "intent" and missing:
            structure_secs = {"经文背景", "段落脉络", "经文解释", "背景"}
            if any(title in structure_secs for title in missing):
                mode = "structure"
    elif mode == "full":
        for title in missing_required_sections(
            text,
            scene,
            narrow=narrow,
            verse_span=verse_span,
        ):
            if title not in missing:
                missing.append(title)

    if mode == "full" and scene in (
        "summary_chapter",
        "summary_chapter_outline",
        "summary_book",
    ):
        for title in missing_summary_sections(scene, text):
            if title not in missing:
                missing.append(title)

    if missing:
        hints.append(f"补写缺失小节：{'、'.join(missing)}")

    if narrow:
        hints.append("Chip 短追问：仅 ### 摘要 + 2–3 条要点，约 120–180 字")

    trunc = _truncation_hint(text)
    if trunc:
        hints.append(trunc)

    if mode in ("structure", "full") and not narrow and is_prose_wall(text, scene):
        hints.append("将散文段改为 ### 标题下 - 列表要点")

    if not missing and scene in ("verse_full", "verse_quick"):
        if mode == "intent":
            pass
        elif verse_explain_incomplete(
            scene,
            text,
            verse_span=verse_span,
            depth=depth,
            expected_sections=planned_sections,
            min_complete=min_complete,
        ):
            hints.append(
                "已有小节但内容偏薄、要点不足或被截断，请加厚要点并自然收束，勿重复"
            )

    if mode == "full" and not missing and scene in (
        "summary_chapter",
        "summary_chapter_outline",
        "summary_book",
    ):
        if summary_incomplete(scene, text):
            hints.append("导读内容偏薄或不完整，请补全列表要点，勿重复")

    return hints


def needs_section_fill(
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    depth: str | None = None,
    planned_sections: tuple[str, ...] | None = None,
    min_complete: int | None = None,
) -> bool:
    return bool(
        collect_section_fill_hints(
            body_text,
            scene,
            narrow=narrow,
            verse_span=verse_span,
            depth=depth,
            planned_sections=planned_sections,
            min_complete=min_complete,
        )
    )


def _fill_user_message(hints: list[str], *, mode: str, restructure: bool) -> str:
    joined = "；".join(hints)
    if restructure:
        return (
            "请把上一条 assistant 回答重排为规范 Markdown。"
            + joined
            + "。不要重复已说信息，不要明显加长，只输出 Markdown 正文。"
        )
    _no_cont = "不要新增「（续）」类小节标题，"
    if mode == "intent":
        return (
            "请补全上一条 assistant 回答中缺失或中断的部分。"
            + joined
            + f"。{_no_cont}不要重复已写内容，保持 ### 中文标题，篇幅与原文相当，自然收束。"
        )
    if mode == "structure":
        return (
            "请补全上一条 assistant 回答。"
            + joined
            + f"。{_no_cont}不要重复已写内容，保持 ### 中文标题与 - 列表格式，自然收束。"
        )
    return (
        "请补全上一条 assistant 回答。"
        + joined
        + f"。{_no_cont}不要重复已写内容，保持 ### 中文标题格式，自然收束。"
    )


def section_fill_once(
    messages: list[dict[str, str]],
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    max_tokens: int = 700,
    verse_span: int = 1,
    depth: str | None = None,
    planned_sections: tuple[str, ...] | None = None,
    min_complete: int | None = None,
) -> str | None:
    """单次 LLM 补形：按 depth 策略补缺失 / 截断 / 结构。返回完整正文或 None。"""
    mode = _fill_mode(depth)
    if mode == "none":
        return None
    hints = collect_section_fill_hints(
        body_text,
        scene,
        narrow=narrow,
        verse_span=verse_span,
        depth=depth,
        planned_sections=planned_sections,
        min_complete=min_complete,
    )
    if not hints:
        return None
    restructure = any("散文" in h for h in hints)
    user = _fill_user_message(hints, mode=mode, restructure=restructure)
    cont = messages + [
        {"role": "assistant", "content": body_text},
        {"role": "user", "content": user},
    ]
    token_cap = _fill_token_cap(depth, max_tokens)
    try:
        extra = complete_chat(
            cont,
            max_tokens=token_cap,
            temperature=0.25 if restructure else 0.35,
        )
    except Exception:
        logger.exception("section_fill failed scene=%s depth=%s", scene, depth)
        return None
    if not extra or not extra.strip():
        return None
    if restructure:
        return extra.strip()
    return body_text.rstrip() + "\n\n" + extra.strip()
