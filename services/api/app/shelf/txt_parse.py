"""纯文本 → 书架书目（空行分段；第 x 章为建议目录）。"""
from __future__ import annotations

import hashlib
import re
from html import escape
from typing import Any

from .html_normalize import inject_shelf_paragraph_anchors

_CHAPTER_RE = re.compile(
    r"^(第[一二三四五六七八九十百零〇\d]+[章节回场部卷]\s*.{0,36}|#{1,3}\s+.+)$"
)
_SENTENCE_RE = re.compile(r"(?<=[。！？；.!?;])\s*")


def _decode_text(data: bytes) -> str:
    for enc in ("utf-8", "utf-8-sig", "gb18030", "gbk"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _split_wall(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if "\n" in text:
        return [p.strip() for p in re.split(r"\n\s*\n+", text) if p.strip()]
    # 无空行的墙：按句切开，每 3～5 句一段
    sentences = [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]
    if len(sentences) <= 1:
        return [text]
    paras: list[str] = []
    buf: list[str] = []
    for s in sentences:
        buf.append(s)
        if len(buf) >= 4:
            paras.append("".join(buf))
            buf = []
    if buf:
        paras.append("".join(buf))
    return paras


def parse_txt_bytes(
    data: bytes,
    *,
    title_hint: str | None = None,
) -> dict[str, Any]:
    text = _decode_text(data).replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    title = (title_hint or "").strip() or "未命名"
    if lines and lines[0].strip() and len(lines[0].strip()) <= 40:
        title = lines[0].strip()

    # 建议切节：以章节行为界
    cuts: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        s = line.strip()
        if s and _CHAPTER_RE.match(s) and len(s) <= 40:
            cuts.append((i, s.lstrip("#").strip()))

    sections: list[dict[str, Any]] = []
    toc_body: list[dict[str, Any]] = []
    needs_confirm = bool(cuts)

    def add_sec(sec_title: str, body_lines: list[str]) -> None:
        body = "\n".join(body_lines).strip()
        paras = _split_wall(body) if body else []
        html_parts = [f'<h2 class="shelf-docx-h1">{escape(sec_title)}</h2>']
        for p in paras:
            html_parts.append(f'<p class="shelf-docx-p">{escape(p)}</p>')
        wrapped = f'<div class="shelf-docx-root">{"\n".join(html_parts)}</div>'
        sid = f"sec-{len(sections)}"
        sec = {
            "id": sid,
            "title": sec_title,
            "level": 1,
            "zone": "body",
            "source": "inferred" if needs_confirm else "structured",
            "toc_id": f"tb-{len(sections)}",
            "html": inject_shelf_paragraph_anchors(wrapped),
        }
        sections.append(sec)
        toc_body.append(
            {
                "id": sec["toc_id"],
                "title": sec_title,
                "level": 1,
                "zone": "body",
                "source": sec["source"],
                "confidence": 0.6 if needs_confirm else 0.9,
                "section_id": sid,
            }
        )

    if not cuts:
        add_sec(title, lines)
    else:
        # 第一章前作为前言
        first_i = cuts[0][0]
        if first_i > 0:
            pref = lines[:first_i]
            if any(x.strip() for x in pref):
                add_sec("前言", pref)
        for idx, (start, sec_title) in enumerate(cuts):
            end = cuts[idx + 1][0] if idx + 1 < len(cuts) else len(lines)
            add_sec(sec_title, lines[start + 1 : end])

    return {
        "title": title,
        "subtitle": "",
        "author": None,
        "toc": {
            "front": [],
            "outline": toc_body,
            "body": toc_body,
            "appendix": [],
        },
        "sections": sections,
        "section_count": len(sections),
        "file_sha256": hashlib.sha256(data).hexdigest(),
        "file_size": len(data),
        "needs_toc_confirm": needs_confirm,
    }
