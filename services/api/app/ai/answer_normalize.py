"""小爱回答 Markdown 归一化：散文转 bullets、字段预算裁剪。"""
from __future__ import annotations

import re

from .answer_schema import (
    PROSE_SECTION_TITLES,
    SUMMARY_LEAD_TITLES,
    SceneBudget,
    budget_for_scene,
    effective_budget_for_scene,
)
from .parse_output import FOLLOWUP_SECTION_RE, SECTION_MD_RE, split_body_and_followups

_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)、])\s+\S")
_SENTENCE_SPLIT = re.compile(r"(?<=[。！？])")


def _trim_chars(text: str, limit: int) -> str:
    s = text.strip()
    if len(s) <= limit:
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


def _chunk_to_bullets(chunk: str, item_max: int, max_items: int) -> list[str]:
    lines = [ln.strip() for ln in chunk.split("\n") if ln.strip()]
    bullets: list[str] = []
    for ln in lines:
        if _BULLET_RE.match(ln):
            item = re.sub(r"^\s*(?:[-*•]|\d+[.)、])\s+", "", ln).strip()
            if item:
                bullets.append(_trim_chars(item, item_max))
        elif bullets and not _BULLET_RE.match(ln):
            bullets[-1] = _trim_chars(bullets[-1] + ln, item_max)
    if bullets:
        return bullets[:max_items]
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


def is_prose_wall(body_text: str, scene: str) -> bool:
    """应 bullets 却写成散文墙。"""
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
    if scene == "verse_full" and span >= 6:
        if title == "经文解释":
            return min(default_max, 5)
        if title in ("段落脉络", "经文背景", "背景"):
            return min(default_max, 4)
    return default_max


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
) -> str:
    """归一化为 ### + bullets Markdown，并按 scene 预算裁剪。"""
    body, followups = split_body_and_followups(text)
    bud = effective_budget_for_scene(scene, narrow=narrow, verse_span=verse_span)
    if not bud or not body.strip():
        return text

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
        parts.append(f"### {title}")
        if title in SUMMARY_LEAD_TITLES:
            lead = chunk.replace("\n", " ").strip()
            parts.append(_trim_chars(lead, bud.summary_max))
            parts.append("")
            continue
        if _section_allows_prose(title):
            prose = chunk.replace("\n\n", "\n").strip()
            if len(prose) > bud.item_max * 3:
                prose = _trim_chars(prose, bud.item_max * 3)
            parts.append(prose)
            parts.append("")
            continue
        bullets = _chunk_to_bullets(
            chunk,
            bud.item_max,
            _section_max_bullets(title, max_bullets, scene, verse_span),
        )
        if not bullets and chunk.strip():
            bullets = [_trim_chars(chunk.replace("\n", " "), bud.item_max)]
        for b in bullets:
            parts.append(f"- {b}")
        parts.append("")

    normalized_body = "\n".join(parts).strip()
    trim_slack = 40 if scene in ("verse_full", "verse_quick") and verse_span >= 6 else 20
    while len(normalized_body) > bud.total_chars + trim_slack and parts:
        removed = False
        for i in range(len(parts) - 1, -1, -1):
            if parts[i].startswith("- "):
                parts.pop(i)
                if i < len(parts) and parts[i] == "":
                    parts.pop(i)
                removed = True
                break
        if not removed:
            break
        normalized_body = "\n".join(parts).strip()

    if followups:
        normalized_body += "\n\n### 相关追问\n"
        normalized_body += "\n".join(f"- {q}" for q in followups)
    return normalized_body.strip()
