"""小爱 section_fill：流后单次补形（P2，替代多轮续写 + repair 链）。"""
from __future__ import annotations

import logging

from .answer_schema import missing_required_sections
from .answer_structured import is_prose_wall
from .llm import complete_chat
from .parse_output import (
    missing_summary_sections,
    missing_verse_sections,
    summary_incomplete,
    verse_explain_incomplete,
)

logger = logging.getLogger(__name__)


def collect_section_fill_hints(
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
) -> list[str]:
    """汇总一次补形所需提示；空列表表示无需 section_fill。"""
    text = body_text.strip()
    if not text:
        return ["补写完整回答，保持 ### 中文标题与 - 列表格式"]
    hints: list[str] = []
    missing: list[str] = []
    for title in missing_required_sections(
        text,
        scene,
        narrow=narrow,
        verse_span=verse_span,
    ):
        if title not in missing:
            missing.append(title)
    if scene in ("verse_full", "verse_quick"):
        for title in missing_verse_sections(scene, text, verse_span=verse_span):
            if title not in missing:
                missing.append(title)
    if scene in ("summary_chapter", "summary_chapter_outline", "summary_book"):
        for title in missing_summary_sections(scene, text):
            if title not in missing:
                missing.append(title)
    if missing:
        hints.append(f"补写缺失小节：{'、'.join(missing)}")
    if not narrow and is_prose_wall(text, scene):
        hints.append("将散文段改为 ### 标题下 - 列表要点")
    if narrow:
        hints.append("Chip 短追问：仅 ### 摘要 + 2–3 条要点，约 120–180 字")
    if not missing and scene in ("verse_full", "verse_quick"):
        if verse_explain_incomplete(scene, text, verse_span=verse_span):
            hints.append(
                "已有小节但内容偏薄、要点不足或被截断，请加厚要点并自然收束，勿重复"
            )
    if not missing and scene in (
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
) -> bool:
    return bool(
        collect_section_fill_hints(
            body_text,
            scene,
            narrow=narrow,
            verse_span=verse_span,
        )
    )


def section_fill_once(
    messages: list[dict[str, str]],
    body_text: str,
    scene: str,
    *,
    narrow: bool = False,
    max_tokens: int = 700,
    verse_span: int = 1,
) -> str | None:
    """单次 LLM 补形：缺失小节 / 散文墙 / 偏薄内容。返回完整正文或 None。"""
    hints = collect_section_fill_hints(
        body_text,
        scene,
        narrow=narrow,
        verse_span=verse_span,
    )
    if not hints:
        return None
    restructure = any("散文" in h for h in hints)
    if restructure:
        user = (
            "请把上一条 assistant 回答重排为规范 Markdown。"
            + "；".join(hints)
            + "。不要重复已说信息，不要明显加长，只输出 Markdown 正文。"
        )
    else:
        user = (
            "请补全上一条 assistant 回答。"
            + "；".join(hints)
            + "。不要重复已写内容，保持 ### 中文标题格式，自然收束。"
        )
    cont = messages + [
        {"role": "assistant", "content": body_text},
        {"role": "user", "content": user},
    ]
    try:
        extra = complete_chat(
            cont,
            max_tokens=min(max_tokens, 900),
            temperature=0.25 if restructure else 0.35,
        )
    except Exception:
        logger.exception("section_fill failed scene=%s", scene)
        return None
    if not extra or not extra.strip():
        return None
    if restructure:
        return extra.strip()
    return body_text.rstrip() + "\n\n" + extra.strip()
