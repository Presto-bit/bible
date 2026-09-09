"""小爱回答 Markdown 归一化：散文转 bullets、字段预算裁剪（R2 软收束）。"""
from __future__ import annotations

import re

from .answer_schema import (
    PROSE_SECTION_TITLES,
    SUMMARY_LEAD_TITLES,
    budget_for_scene,
    effective_budget_for_scene,
)
from .parse_output import (
    FOLLOWUP_SECTION_RE,
    SECTION_MD_RE,
    merge_continuation_sections,
    split_body_and_followups,
)

_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)、])\s+\S")
# LLM 偶发复述系统 prompt 内部标签，展示前剥离
_PROMPT_LEAK_RE = re.compile(
    r"^[ \t]*(?:【(?:快懂模式|教案模式|标准模式[^】]*)】|【Markdown 规范[^】]*】)\s*\n?",
    re.MULTILINE,
)
_PROMPT_LEAK_MD_RE = re.compile(
    r"^[ \t]*###\s*(?:快懂模式|教案模式|标准模式[^\n]*)\s*\n?",
    re.MULTILINE,
)


def strip_prompt_leakage(text: str) -> str:
    s = _PROMPT_LEAK_RE.sub("", text)
    return _PROMPT_LEAK_MD_RE.sub("", s).strip()
_SENTENCE_SPLIT = re.compile(r"(?<=[。！？])")
_SENTENCE_END = "。！？）」』》】"


def _trim_chars(text: str, limit: int, *, hard: bool = False) -> str:
    """R2：默认软裁剪——仅当超过 2×limit 才截断。"""
    s = text.strip()
    cap = limit if hard else max(limit * 2, limit + 40)
    if len(s) <= cap:
        return s
    cut = s[:limit]
    for i in range(len(cut) - 1, max(8, len(cut) - 12), -1):
        if cut[i] in "，、；。！？":
            return cut[: i + 1 if cut[i] in "。！？" else i].rstrip("，、；") + "…"
    return cut.rstrip("，,、；; ") + "…"


def _split_sentences(chunk: str) -> list[str]:
    parts = [p.strip() for p in _SENTENCE_SPLIT.split(chunk.strip()) if p.strip()]
    if parts:
        return parts
    line = chunk.strip()
    return [line] if line else []


def _section_chunks(body: str) -> list[tuple[str, str]]:
    """按 ### 切分 (title, content)。"""
    matches = list(SECTION_MD_RE.finditer(body))
    if not matches:
        return [("", body.strip())] if body.strip() else []
    out: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        if title == "相关追问":
            break
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        out.append((title, body[start:end].strip()))
    return out


def _chunk_to_bullets(
    chunk: str,
    item_max: int,
    max_items: int,
    *,
    format_only: bool = False,
) -> list[str]:
    lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
    bullets: list[str] = []
    for ln in lines:
        if _BULLET_RE.match(ln):
            item = re.sub(r"^\s*(?:[-*•]|\d+[.)、])\s+", "", ln).strip()
            if item:
                bullets.append(item if format_only else _trim_chars(item, item_max))
        elif bullets and not _BULLET_RE.match(ln):
            merged = bullets[-1] + ln
            bullets[-1] = merged if format_only else _trim_chars(merged, item_max)
    if bullets:
        return bullets[:max_items]
    if format_only:
        return lines[:max_items]
    prose = " ".join(lines)
    for sent in _split_sentences(prose):
        bullets.append(_trim_chars(sent, item_max))
        if len(bullets) >= max_items:
            break
    return bullets[:max_items]


def _section_allows_prose(title: str) -> bool:
    if title in PROSE_SECTION_TITLES:
        return True
    return title.startswith("观点 ")


def _keep_section_prose(
    title: str,
    *,
    depth: str | None,
    prefer_prose: bool,
) -> bool:
    if title in SUMMARY_LEAD_TITLES or title in {"一句话", "主题"}:
        return False
    if _section_allows_prose(title):
        return True
    if depth == "flash" or prefer_prose:
        return True
    if depth == "standard" and prefer_prose:
        return True
    return False


def is_prose_wall(body_text: str, scene: str) -> bool:
    """应 bullets 却写成散文墙（R2：study/deep 才强转）。"""
    bullet_scenes = {
        "verse_full",
        "verse_quick",
        "chat_explain",
        "chat_understand",
        "chat_apply",
        "summary_chapter",
        "summary_chapter_outline",
    }
    if scene not in bullet_scenes:
        return False
    for title, chunk in _section_chunks(body_text):
        if not title or title in SUMMARY_LEAD_TITLES or _section_allows_prose(title):
            continue
        if not chunk:
            continue
        lines = [ln for ln in chunk.split("\n") if ln.strip()]
        bullet_lines = sum(1 for ln in lines if _BULLET_RE.match(ln))
        if bullet_lines == 0 and len(chunk) > 80:
            return True
        if bullet_lines == 0 and len(lines) >= 2:
            return True
    return False


def _section_max_bullets(
    title: str,
    default_max: int,
    scene: str,
    verse_span: int,
) -> int:
    span = max(1, int(verse_span or 1))
    if scene in ("verse_full", "verse_quick") and span >= 6:
        if title == "经文解释":
            from .answer_schema import verse_explain_max_bullets

            return max(default_max, verse_explain_max_bullets(span))
        if title in ("段落脉络", "经文背景", "背景"):
            return max(default_max, min(4 + span // 8, 6))
    return default_max


def _trim_incomplete_tail_bullet(parts: list[str]) -> bool:
    """仅移除末尾未收束的 bullet（句中截断），保留完整要点。"""
    for i in range(len(parts) - 1, -1, -1):
        line = parts[i]
        if not line.startswith("- "):
            continue
        item = line[2:].strip()
        if not item:
            parts.pop(i)
            if i < len(parts) and parts[i] == "":
                parts.pop(i)
            return True
        if item.endswith("…") or item.endswith("..."):
            parts.pop(i)
            if i < len(parts) and parts[i] == "":
                parts.pop(i)
            return True
        if item and item[-1] not in _SENTENCE_END:
            parts.pop(i)
            if i < len(parts) and parts[i] == "":
                parts.pop(i)
            return True
        return False
    return False


def answer_over_budget(body_text: str, scene: str, *, narrow: bool = False, verse_span: int = 1) -> bool:
    bud = effective_budget_for_scene(scene, narrow=narrow, verse_span=verse_span)
    if not bud:
        return False
    return len(body_text.strip()) > bud.total_chars + 40


def normalize_answer_markdown(
    text: str,
    scene: str,
    *,
    narrow: bool = False,
    verse_span: int = 1,
    depth: str | None = None,
    soft_max: int | None = None,
    prefer_prose: bool = False,
    format_only: bool = False,
) -> str:
    """归一化为 ### + bullets/prose Markdown。

    format_only=True（R3）：fill 后只整理标题/列表形态，不做字数裁剪。
    """
    text = strip_prompt_leakage(text)
    text = merge_continuation_sections(text)
    body, followups = split_body_and_followups(text)
    bud = effective_budget_for_scene(scene, narrow=narrow, verse_span=verse_span)
    if not bud or not body.strip():
        return text

    if format_only:
        prefer_prose = True

    max_bullets = bud.max_bullets
    if scene in ("verse_full", "verse_quick") and verse_span >= 3:
        max_bullets = min(
            max_bullets + (verse_span - 2) // 2,
            bud.max_bullets + (2 if verse_span >= 6 else 1),
        )

    parts: list[str] = []
    for title, chunk in _section_chunks(body):
        if not title:
            if chunk:
                parts.append(chunk)
            continue
        if scene in ("verse_full", "verse_quick") and title == "背景":
            title = "经文背景"
        parts.append(f"### {title}")
        if title in SUMMARY_LEAD_TITLES or title in {"一句话", "主题"}:
            lead = chunk.replace("\n", " ").strip()
            parts.append(lead if format_only else _trim_chars(lead, bud.summary_max))
            parts.append("")
            continue
        if format_only or _keep_section_prose(title, depth=depth, prefer_prose=prefer_prose):
            prose = chunk.replace("\n\n", "\n").strip()
            if not format_only and len(prose) > bud.item_max * (6 if depth == "flash" else 4):
                prose = _trim_chars(prose, bud.item_max * (6 if depth == "flash" else 4))
            parts.append(prose)
            parts.append("")
            continue
        bullets = _chunk_to_bullets(
            chunk,
            bud.item_max,
            _section_max_bullets(title, max_bullets, scene, verse_span),
            format_only=format_only,
        )
        if not bullets and chunk.strip():
            raw = chunk.replace("\n", " ").strip()
            bullets = [raw if format_only else _trim_chars(raw, bud.item_max)]
        for b in bullets:
            parts.append(f"- {b}")
        parts.append("")

    normalized_body = "\n".join(parts).strip()
    if not format_only:
        hard_cap: int | None = None
        if depth == "flash":
            hard_cap = soft_max or (bud.total_chars + 80)
        elif depth in ("standard", "deep") and soft_max:
            hard_cap = soft_max + (80 if depth == "deep" else 120)
        elif depth == "study":
            base = budget_for_scene(scene, narrow=narrow)
            hard_cap = (soft_max or (base.total_chars if base else bud.total_chars)) + 160
        elif soft_max:
            hard_cap = soft_max + 80

        if hard_cap and len(normalized_body) > hard_cap:
            if depth in ("flash", "standard", None):
                pass
            else:
                while len(normalized_body) > hard_cap and _trim_incomplete_tail_bullet(parts):
                    normalized_body = "\n".join(parts).strip()

    if followups:
        normalized_body += "\n\n### 相关追问\n"
        normalized_body += "\n".join(f"- {q}" for q in followups)
    return normalized_body.strip()
