"""小爱回答后处理：追问、区块、正文字数。"""
from __future__ import annotations

import re

FOLLOWUP_SECTION_RE = re.compile(
    r"\n[ \t]*(?:###\s*相关追问|【相关追问】|\[相关追问\]|相关追问\s*[:：])"
)
SECTION_MD_RE = re.compile(r"^###\s+(.+)$", re.MULTILINE)
SECTION_RE = re.compile(r"【([^】]+)】")


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
        q = mm.group(1).strip().strip('"“').strip('"”')
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


def verse_explain_incomplete(scene: str, body_text: str) -> bool:
    """读经半屏解读是否缺必需小节或明显过短。"""
    if scene not in ("verse_full", "verse_quick"):
        return False
    text = body_text.strip()
    if not text:
        return True
    titles = {s["title"] for s in extract_sections(text)}
    if scene == "verse_full":
        if len(text) < 100:
            return True
        return not _VERSE_FULL_SECTIONS.issubset(titles)
    if len(text) < 60:
        return True
    return not _VERSE_QUICK_SECTIONS.issubset(titles)


def missing_verse_sections(scene: str, body_text: str) -> list[str]:
    titles = {s["title"] for s in extract_sections(body_text)}
    required = (
        list(_VERSE_FULL_SECTIONS)
        if scene == "verse_full"
        else list(_VERSE_QUICK_SECTIONS)
    )
    return [s for s in required if s not in titles]
