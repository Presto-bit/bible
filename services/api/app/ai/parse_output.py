"""小爱回答后处理：追问、区块、正文字数。"""
from __future__ import annotations

import re

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


def verse_explain_incomplete(scene: str, body_text: str, *, verse_span: int = 1) -> bool:
    """读经半屏解读是否缺必需小节或明显被截断（非「偏短但已完整」）。"""
    if scene not in ("verse_full", "verse_quick"):
        return False
    text = body_text.strip()
    if not text:
        return True
    titles = {s["title"] for s in extract_sections(text)}
    span = max(1, int(verse_span or 1))
    required = _VERSE_FULL_SECTIONS if scene == "verse_full" else _VERSE_QUICK_SECTIONS
    missing = not required.issubset(titles)
    if missing:
        floor = (80 if scene == "verse_full" else 50) + max(0, span - 1) * 20
        if len(text) < floor:
            return True
        return True
    # 小节齐全：仅在硬下限或截断迹象时续写，不因「略短」而加长
    hard_floor = 70 if scene == "verse_full" else 45
    if len(text) < hard_floor:
        return True
    return answer_ends_abruptly(text)


def verse_needs_length_continuation(
    scene: str,
    body_text: str,
    *,
    verse_span: int = 1,
    finish_reason: str | None = None,
) -> bool:
    """是否值得做长度续写（避免把已完整的短答越续越长）。"""
    if scene not in ("verse_full", "verse_quick"):
        if finish_reason == "length":
            return answer_ends_abruptly(body_text)
        return False
    incomplete = verse_explain_incomplete(scene, body_text, verse_span=verse_span)
    if not incomplete:
        return False
    if finish_reason == "length":
        return answer_ends_abruptly(body_text)
    return answer_ends_abruptly(body_text)


def missing_verse_sections(scene: str, body_text: str) -> list[str]:
    titles = {s["title"] for s in extract_sections(body_text)}
    required = (
        list(_VERSE_FULL_SECTIONS)
        if scene == "verse_full"
        else list(_VERSE_QUICK_SECTIONS)
    )
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
