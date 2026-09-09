"""小爱回答后处理：追问、区块、正文字数。"""
from __future__ import annotations

import re

from .answer_schema import (
    verse_explain_max_bullets,
    verse_has_background,
    verse_min_background_bullets,
    verse_min_chars,
    verse_min_explain_bullets,
    verse_min_outline_bullets,
    verse_passage_structure_ok,
)

FOLLOWUP_SECTION_RE = re.compile(
    r"\n[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])"
)
SECTION_MD_RE = re.compile(r"^###\s+(.+)$", re.MULTILINE)
SECTION_RE = re.compile(r"【([^】]+)】")
_FOLLOWUP_FILLER_RE = re.compile(r"^(请|能否|是否可以|可以|麻烦|想要)")
_MAX_FOLLOWUP_LEN = 24


def compact_followup(q: str) -> str:
    """Chip 展示用：去掉客套前缀，必要时截断。"""
    s = q.strip().strip('"“”')
    s = _FOLLOWUP_FILLER_RE.sub("", s).strip()
    if len(s) > _MAX_FOLLOWUP_LEN:
        cut = s[:_MAX_FOLLOWUP_LEN]
        for i in range(len(cut) - 1, max(5, len(cut) - 6), -1):
            if cut[i] in "，、；：":
                cut = cut[:i]
                break
        s = cut.rstrip("，,、；;：: ") + "…"
    return s.strip()


def split_body_and_followups(text: str) -> tuple[str, list[str]]:
    m = FOLLOWUP_SECTION_RE.search(text)
    body = text[: m.start()].strip() if m else text.strip()
    if not m:
        return body, []
    tail = text[m.start() :]
    followups: list[str] = []
    for line in tail.split("\n")[1:]:
        mm = re.match(r"^\s*(?:[-*•]|\d+[.)、]|①|②|③|④|⑤)\s*(.+?)\s*$", line.strip())
        if not mm:
            continue
        q = compact_followup(mm.group(1).strip().strip('"“').strip('"”'))
        if q and q not in followups:
            followups.append(q)
        if len(followups) >= 3:
            break
    return body, followups


def extract_sections(text: str) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    for m in SECTION_MD_RE.finditer(text):
        title = m.group(1).strip()
        if title == "相关追问":
            break
        sections.append({"id": title, "title": title})
    if sections:
        return sections
    for m in SECTION_RE.finditer(text):
        title = m.group(1).strip()
        if title == "相关追问":
            break
        sections.append({"id": title, "title": title})
    return sections


_VERSE_FULL_SECTIONS = frozenset({"摘要", "背景", "经文解释"})
_VERSE_QUICK_SECTIONS = frozenset({"摘要", "经文解释"})
_SENTENCE_END_CHARS = "。！？）」』》】"


def answer_ends_abruptly(body_text: str) -> bool:
    """正文是否在句中/段中被截断（非自然收束）。"""
    text = body_text.strip()
    if not text:
        return False
    if text.endswith("…") or text.endswith("..."):
        return True
    tail = text.rstrip()
    if tail.endswith("###"):
        return True
    if tail and tail[-1] not in _SENTENCE_END_CHARS:
        return True
    return False


def mid_bullet_truncated(body_text: str) -> bool:
    """列表要点是否在句中被硬裁（末尾 … 或无句末标点）。"""
    for _title, chunk in _iter_section_chunks(body_text):
        for line in chunk.split("\n"):
            mm = re.match(r"^\s*(?:[-*•]|\d+[.)、])\s+(.+?)\s*$", line.strip())
            if not mm:
                continue
            item = mm.group(1).strip()
            if not item:
                continue
            if item.endswith("…") or item.endswith("..."):
                return True
            if len(item) >= 12 and item[-1] not in _SENTENCE_END_CHARS:
                return True
    return False


def _iter_section_chunks(body_text: str):
    matches = list(SECTION_MD_RE.finditer(body_text))
    if not matches:
        if body_text.strip():
            yield "", body_text.strip()
        return
    for i, m in enumerate(matches):
        title = m.group(1).strip()
        if title == "相关追问":
            break
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body_text)
        yield title, body_text[start:end].strip()


def _section_bullet_count(body_text: str, section_title: str) -> int:
    matches = list(SECTION_MD_RE.finditer(body_text))
    for i, m in enumerate(matches):
        if m.group(1).strip() != section_title:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body_text)
        chunk = body_text[start:end]
        return sum(
            1
            for line in chunk.split("\n")
            if re.match(r"^\s*(?:[-*•]|\d+[.)、])\s+\S", line.strip())
        )
    return 0


def _section_bullet_count_any(body_text: str, section_titles: tuple[str, ...]) -> int:
    return max(_section_bullet_count(body_text, title) for title in section_titles)


def _section_bullets_avg_len(body_text: str, section_title: str) -> float:
    matches = list(SECTION_MD_RE.finditer(body_text))
    for i, m in enumerate(matches):
        if m.group(1).strip() != section_title:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body_text)
        chunk = body_text[start:end]
        items: list[str] = []
        for line in chunk.split("\n"):
            mm = re.match(r"^\s*(?:[-*•]|\d+[.)、])\s+(.+?)\s*$", line.strip())
            if mm and mm.group(1).strip():
                items.append(mm.group(1).strip())
        if not items:
            return 0.0
        return sum(len(s) for s in items) / len(items)
    return 0.0


def _verse_sections_satisfied(
    scene: str,
    titles: set[str],
    *,
    verse_span: int,
    expected_sections: tuple[str, ...] | None = None,
) -> bool:
    if expected_sections:
        for sec in expected_sections:
            if sec in ("经文背景", "背景"):
                if not verse_has_background(titles):
                    return False
            elif sec not in titles:
                return False
        return True
    if scene == "verse_quick":
        return _VERSE_QUICK_SECTIONS.issubset(titles)
    if "摘要" not in titles or "经文解释" not in titles:
        return False
    return verse_passage_structure_ok(
        titles,
        verse_span=verse_span,
        require_outline=verse_span >= 6,
    )


def _planned_sections_missing(
    titles: set[str],
    expected: tuple[str, ...],
) -> list[str]:
    missing: list[str] = []
    for sec in expected:
        if sec in ("经文背景", "背景"):
            if not verse_has_background(titles):
                missing.append(sec)
        elif sec not in titles:
            missing.append(sec)
    return missing


def _section_text(body_text: str, section_title: str) -> str:
    matches = list(SECTION_MD_RE.finditer(body_text))
    for i, m in enumerate(matches):
        if m.group(1).strip() != section_title:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body_text)
        return body_text[start:end].strip()
    return ""


def verse_explain_incomplete(
    scene: str,
    body_text: str,
    *,
    verse_span: int = 1,
    depth: str | None = None,
    expected_sections: tuple[str, ...] | None = None,
    min_complete: int | None = None,
) -> bool:
    """读经解读是否不完整（R2：语义优先 + depth 感知）。"""
    if scene not in ("verse_full", "verse_quick"):
        return False
    text = body_text.strip()
    if not text:
        return True
    if answer_ends_abruptly(text) or mid_bullet_truncated(text):
        return True

    titles = {s["title"] for s in extract_sections(text)}
    span = max(1, int(verse_span or 1))

    if depth == "flash":
        if "摘要" not in titles and not text:
            return True
        floor = min_complete if min_complete is not None else (70 if span <= 1 else 90)
        return len(text) < floor

    if not _verse_sections_satisfied(
        scene,
        titles,
        verse_span=span,
        expected_sections=expected_sections,
    ):
        return True

    floor = min_complete
    if floor is None:
        floor = verse_min_chars(scene, span)
        if depth == "standard":
            floor = max(60, floor - 30)
    if len(text) < floor:
        return True

    if depth in ("standard", None) and not expected_sections:
        explain_bullets = _section_bullet_count(text, "经文解释")
        if explain_bullets:
            if explain_bullets < max(2, verse_min_explain_bullets(span) - 1):
                return True
        elif "经文解释" in titles:
            chunk = _section_text(text, "经文解释")
            if chunk and len(chunk.strip()) < 40:
                return True
        return False

    if depth in ("deep", "study") or (
        expected_sections and "段落脉络" in expected_sections
    ):
        explain_bullets = _section_bullet_count(text, "经文解释")
        if explain_bullets < verse_min_explain_bullets(span):
            return True
        if span >= 6 and (
            expected_sections is None or "段落脉络" in expected_sections
        ):
            bg_bullets = _section_bullet_count_any(text, ("经文背景", "背景"))
            if bg_bullets < verse_min_background_bullets(span):
                return True
            if "段落脉络" in (expected_sections or ("段落脉络",)):
                if _section_bullet_count(text, "段落脉络") < verse_min_outline_bullets(span):
                    return True
            if explain_bullets > verse_explain_max_bullets(span):
                return True
            avg_len = _section_bullets_avg_len(text, "经文解释")
            if explain_bullets >= 4 and 0 < avg_len < 32:
                return True
    return False


def verse_needs_length_continuation(
    scene: str,
    body_text: str,
    *,
    verse_span: int = 1,
    finish_reason: str | None = None,
    depth: str | None = None,
    expected_sections: tuple[str, ...] | None = None,
    min_complete: int | None = None,
) -> bool:
    """是否值得做长度续写（避免把已完整的短答越续越长）。"""
    if scene not in ("verse_full", "verse_quick"):
        if finish_reason == "length":
            return answer_ends_abruptly(body_text)
        return False
    incomplete = verse_explain_incomplete(
        scene,
        body_text,
        verse_span=verse_span,
        depth=depth,
        expected_sections=expected_sections,
        min_complete=min_complete,
    )
    if not incomplete:
        return False
    if expected_sections:
        titles = {s["title"] for s in extract_sections(body_text)}
        if _planned_sections_missing(titles, expected_sections):
            return True
    if finish_reason == "length":
        return answer_ends_abruptly(body_text)
    return answer_ends_abruptly(body_text)


def answer_marked_incomplete(
    scene: str,
    body_text: str,
    *,
    verse_span: int = 1,
    depth: str | None = None,
    expected_sections: tuple[str, ...] | None = None,
    min_complete: int | None = None,
) -> bool:
    """统一 incomplete 判定（R2：语义 + depth）。"""
    if scene in ("verse_full", "verse_quick"):
        return verse_explain_incomplete(
            scene,
            body_text,
            verse_span=verse_span,
            depth=depth,
            expected_sections=expected_sections,
            min_complete=min_complete,
        )
    if scene in (
        "summary_chapter",
        "summary_chapter_outline",
        "summary_book",
    ):
        return summary_incomplete(scene, body_text) or mid_bullet_truncated(body_text)
    return answer_ends_abruptly(body_text) or mid_bullet_truncated(body_text)


def missing_verse_sections(
    scene: str,
    body_text: str,
    *,
    verse_span: int = 1,
    expected_sections: tuple[str, ...] | None = None,
) -> list[str]:
    titles = {s["title"] for s in extract_sections(body_text)}
    span = max(1, int(verse_span or 1))
    if expected_sections:
        return _planned_sections_missing(titles, expected_sections)
    if scene == "verse_full":
        missing: list[str] = []
        if "摘要" not in titles:
            missing.append("摘要")
        if not verse_has_background(titles):
            missing.append("经文背景")
        if span >= 6 and "段落脉络" not in titles:
            missing.append("段落脉络")
        if "经文解释" not in titles:
            missing.append("经文解释")
        return missing
    required = list(_VERSE_QUICK_SECTIONS)
    return [s for s in required if s not in titles]


_SUMMARY_CHAPTER_SECTIONS = frozenset({"本章概览", "核心内容"})
_SUMMARY_CHAPTER_OUTLINE_SECTIONS = frozenset({"本章概览", "分段要点", "读经提示"})
_SUMMARY_BOOK_SECTIONS = frozenset({"卷概览", "结构脉络", "核心主题", "读经提示"})


def _list_item_count(text: str) -> int:
    return sum(
        1
        for line in text.split("\n")
        if re.match(r"^\s*(?:[-*•]|\d+[.)、])\s+\S", line.strip())
    )


def summary_incomplete(scene: str, body_text: str) -> bool:
    """章/卷导读是否缺必需小节、列表过短或明显截断。"""
    if scene not in (
        "summary_chapter",
        "summary_chapter_outline",
        "summary_book",
    ):
        return False
    text = body_text.strip()
    if not text:
        return True
    if text.endswith("…") or text.endswith("..."):
        return True
    if text and text[-1] not in "。！？）」』》】":
        return True
    titles = {s["title"] for s in extract_sections(text)}
    if scene == "summary_chapter":
        if len(text) < 40:
            return True
        if not _SUMMARY_CHAPTER_SECTIONS.issubset(titles):
            return True
        return _list_item_count(text) < 2
    if scene == "summary_chapter_outline":
        if len(text) < 80:
            return True
        if not _SUMMARY_CHAPTER_OUTLINE_SECTIONS.issubset(titles):
            return True
        return _list_item_count(text) < 3
    if scene == "summary_book":
        if len(text) < 120:
            return True
        return not _SUMMARY_BOOK_SECTIONS.issubset(titles)
    return False


def missing_summary_sections(scene: str, body_text: str) -> list[str]:
    titles = {s["title"] for s in extract_sections(body_text)}
    if scene == "summary_chapter":
        required = list(_SUMMARY_CHAPTER_SECTIONS)
    elif scene == "summary_chapter_outline":
        required = list(_SUMMARY_CHAPTER_OUTLINE_SECTIONS)
    elif scene == "summary_book":
        required = list(_SUMMARY_BOOK_SECTIONS)
    else:
        return []
    return [s for s in required if s not in titles]


_TIMELINE_SECTION_TITLES = frozenset(
    {"时间线", "年代脉络", "历史脉络", "人物生平", "年代"}
)
_TIMELINE_ITEM_RE = re.compile(
    r"^\s*(?:[-*•]|\d+[.)、])\s+\*\*(.+?)\*\*\s*(.*)$"
)


def parse_timeline_nodes(text: str) -> list[dict[str, str]]:
    """从 ### 时间线 等小节反解析竖轴节点。"""
    body = text.strip()
    if not body:
        return []
    section_re = re.compile(
        r"(?:^|\n)###\s+(" + "|".join(re.escape(t) for t in _TIMELINE_SECTION_TITLES) + r")\s*\n",
        re.MULTILINE,
    )
    m = section_re.search(body)
    if not m:
        return []
    tail = body[m.end() :]
    next_h = re.search(r"\n###\s+", tail)
    chunk = tail[: next_h.start()] if next_h else tail
    nodes: list[dict[str, str]] = []
    for line in chunk.split("\n"):
        mm = _TIMELINE_ITEM_RE.match(line.strip())
        if not mm:
            continue
        year = mm.group(1).strip()
        note = mm.group(2).strip()
        if year:
            nodes.append({"year": year, "label": note or year, "note": note})
    return nodes[:8]


def parse_answer_blocks(text: str) -> dict:
    """Markdown 正文反解析为 blocks（P2，兼容旧客户端）。"""
    body, _ = split_body_and_followups(text)
    sections = extract_sections(body)
    lead = ""
    lead_m = re.search(
        r"(?:^|\n)###\s*(?:摘要|本章概览|卷概览)\s*\n+([^\n#]+)",
        body,
    )
    if lead_m:
        lead = lead_m.group(1).strip()
    blocks: list[dict] = []
    if lead:
        blocks.append({"type": "lead", "text": lead})
    timeline = parse_timeline_nodes(body)
    if timeline:
        blocks.append({"type": "timeline", "items": timeline})
    for sec in sections:
        title = sec["title"]
        if title in {"摘要", "本章概览", "卷概览", "相关追问"}:
            continue
        if title in _TIMELINE_SECTION_TITLES:
            continue
        sec_m = re.search(rf"(?:^|\n)###\s+{re.escape(title)}\s*\n", body)
        if not sec_m:
            continue
        tail = body[sec_m.end() :]
        next_h = re.search(r"\n###\s+", tail)
        chunk = (tail[: next_h.start()] if next_h else tail).strip()
        if not chunk:
            continue
        items = [
            re.sub(r"^\s*(?:[-*•]|\d+[.)、])\s+", "", ln.strip())
            for ln in chunk.split("\n")
            if re.match(r"^\s*(?:[-*•]|\d+[.)、])\s+\S", ln.strip())
        ]
        if items:
            blocks.append({"type": "list", "title": title, "items": items[:12]})
        else:
            blocks.append({"type": "paragraph", "title": title, "text": chunk[:800]})
    return {"lead": lead, "blocks": blocks, "timeline": timeline}
