"""纯文本 → 书架书目（空行分段；第 x 章为建议目录，默认整本一节）。"""
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


def _lines_to_html(sec_title: str, body_lines: list[str]) -> str:
    body = "\n".join(body_lines).strip()
    paras = _split_wall(body) if body else []
    html_parts = [f'<h2 class="shelf-docx-h1">{escape(sec_title)}</h2>']
    for p in paras:
        html_parts.append(f'<p class="shelf-docx-p">{escape(p)}</p>')
    wrapped = f'<div class="shelf-docx-root">{"\n".join(html_parts)}</div>'
    return inject_shelf_paragraph_anchors(wrapped)


def parse_txt_bytes(
    data: bytes,
    *,
    title_hint: str | None = None,
    apply_suggested: bool = False,
) -> dict[str, Any]:
    """默认整本一节；第 x 章等仅入 toc.plan。apply_suggested=True 时按建议切节。"""
    text = _decode_text(data).replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    title = (title_hint or "").strip() or "未命名"
    if lines and lines[0].strip() and len(lines[0].strip()) <= 40:
        title = lines[0].strip()

    cuts: list[tuple[int, str]] = []
    for i, line in enumerate(lines):
        s = line.strip()
        if s and _CHAPTER_RE.match(s) and len(s) <= 40:
            cuts.append((i, s.lstrip("#").strip()))

    suggested = [
        {
            "id": f"cut-{i}",
            "title": sec_title,
            "level": 1,
            "zone": "body",
            "anchor": {"type": "paragraph", "index": start},
            "confidence": 0.6,
        }
        for i, (start, sec_title) in enumerate(cuts)
    ]

    sections: list[dict[str, Any]] = []
    toc_body: list[dict[str, Any]] = []

    def add_sec(sec_title: str, body_lines: list[str], *, source: str, conf: float) -> None:
        sid = f"sec-{len(sections)}"
        sec = {
            "id": sid,
            "title": sec_title,
            "level": 1,
            "zone": "body",
            "source": source,
            "toc_id": f"tb-{len(sections)}",
            "html": _lines_to_html(sec_title, body_lines),
        }
        sections.append(sec)
        toc_body.append(
            {
                "id": sec["toc_id"],
                "title": sec_title,
                "level": 1,
                "zone": "body",
                "source": source,
                "confidence": conf,
                "section_id": sid,
            }
        )

    needs_confirm = bool(cuts) and not apply_suggested
    if apply_suggested and cuts:
        first_i = cuts[0][0]
        if first_i > 0:
            pref = lines[:first_i]
            if any(x.strip() for x in pref):
                add_sec("前言", pref, source="inferred", conf=0.6)
        for idx, (start, sec_title) in enumerate(cuts):
            end = cuts[idx + 1][0] if idx + 1 < len(cuts) else len(lines)
            add_sec(sec_title, lines[start + 1 : end], source="inferred", conf=0.6)
    else:
        add_sec(title, lines, source="plain", conf=0.9)

    return {
        "title": title,
        "subtitle": "",
        "author": None,
        "toc": {
            "front": [],
            "outline": [
                {
                    "id": c["id"],
                    "title": c["title"],
                    "level": 1,
                    "zone": "body",
                    "source": "inferred",
                    "confidence": 0.6,
                    "section_id": None,
                    "suggested": True,
                }
                for c in suggested
            ]
            if needs_confirm
            else toc_body,
            "body": toc_body,
            "appendix": [],
            "plan": {
                "source": "inferred" if cuts else "plain",
                "confidence": 0.6 if cuts else 0.9,
                "cuts": suggested,
                "needs_confirm": needs_confirm,
            },
        },
        "sections": sections,
        "section_count": len(sections),
        "file_sha256": hashlib.sha256(data).hexdigest(),
        "file_size": len(data),
        "needs_toc_confirm": needs_confirm,
    }
