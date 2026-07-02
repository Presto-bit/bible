"""小爱回答后处理：追问、区块、正文字数。"""
from __future__ import annotations

import re

FOLLOWUP_SECTION_RE = re.compile(
    r"\n[ \t]*(?:【相关追问】|\[相关追问\]|相关追问\s*[:：])"
)
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
    for m in SECTION_RE.finditer(text):
        title = m.group(1).strip()
        if title == "相关追问":
            break
        sections.append({"id": title, "title": title})
    return sections
