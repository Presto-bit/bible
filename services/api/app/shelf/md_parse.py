"""Markdown → 书架书目（按 ATX 标题切节）。"""
from __future__ import annotations

import hashlib
import re
from html import escape
from pathlib import Path
from typing import Any

from .html_normalize import inject_shelf_paragraph_anchors
from .store import shelf_dir

_ATX_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*#*\s*$", re.MULTILINE)


def _md_to_html(md: str) -> str:
    try:
        from markdown_it import MarkdownIt

        parser = MarkdownIt("commonmark", {"html": False}).enable("strikethrough").enable("table")
        return parser.render(md)
    except Exception:
        paras = [p.strip() for p in re.split(r"\n\s*\n", md) if p.strip()]
        return "\n".join(f"<p>{escape(p)}</p>" for p in paras)


def _rewrite_md_images(html: str, *, book_id: str, stem: str, media_dir: Path) -> str:
    """data URI / 相对路径图暂不拉取外链；仅处理后续可扩展。"""
    _ = (book_id, stem, media_dir)
    return html


def parse_markdown_bytes(
    data: bytes,
    *,
    book_id: str = "",
    storage_key: str = "book.md",
    title_hint: str | None = None,
) -> dict[str, Any]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("gbk", errors="replace")

    stem = Path(storage_key).stem or "md"
    media_dir = shelf_dir()
    matches = list(_ATX_RE.finditer(text))
    title = (title_hint or "").strip() or "未命名"
    subtitle = ""

    if matches and matches[0].group(1) == "#" and matches[0].start() < 80:
        title = matches[0].group(2).strip() or title

    sections: list[dict[str, Any]] = []
    toc_body: list[dict[str, Any]] = []

    def add_section(sec_title: str, body_md: str, *, level: int, zone: str = "body") -> None:
        raw_html = _md_to_html(body_md.strip() or sec_title)
        raw_html = _rewrite_md_images(raw_html, book_id=book_id, stem=stem, media_dir=media_dir)
        # 套 prose 类
        raw_html = re.sub(r"<h1\b", '<h1 class="shelf-docx-title"', raw_html, flags=re.I)
        raw_html = re.sub(r"<h2\b", '<h2 class="shelf-docx-h1"', raw_html, flags=re.I)
        raw_html = re.sub(r"<h3\b", '<h3 class="shelf-docx-h2"', raw_html, flags=re.I)
        raw_html = re.sub(
            r"<p\b(?![^>]*class=)",
            '<p class="shelf-docx-p"',
            raw_html,
            flags=re.I,
        )
        wrapped = f'<div class="shelf-docx-root">{raw_html}</div>'
        sid = f"sec-{len(sections)}"
        sec = {
            "id": sid,
            "title": sec_title,
            "level": level,
            "zone": zone,
            "source": "structured",
            "toc_id": f"tb-{len(sections)}",
            "html": inject_shelf_paragraph_anchors(wrapped),
        }
        sections.append(sec)
        if level <= 1:
            toc_body.append(
                {
                    "id": sec["toc_id"],
                    "title": sec_title,
                    "level": level,
                    "zone": zone,
                    "source": "structured",
                    "confidence": 1.0,
                    "section_id": sid,
                }
            )

    if not matches:
        add_section(title, text, level=1)
    else:
        # 前言：第一个二级/一级标题之前
        first = matches[0]
        preface = text[: first.start()].strip()
        if preface and first.group(1) != "#":
            add_section("前言", preface, level=0, zone="front")
        for idx, m in enumerate(matches):
            level = len(m.group(1))
            sec_title = m.group(2).strip()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            body = text[m.end() : end]
            # 一级标题单独成节标题；正文不含重复 h1
            chunk = f"{'#' * level} {sec_title}\n{body}"
            zone = "front" if level == 0 else "body"
            add_section(sec_title, chunk, level=min(level, 2), zone=zone)

    return {
        "title": title,
        "subtitle": subtitle,
        "author": None,
        "toc": {
            "front": [t for t in toc_body if t.get("zone") == "front"],
            "outline": [t for t in toc_body if t.get("zone") == "body"],
            "body": [t for t in toc_body if t.get("zone") == "body"],
            "appendix": [],
        },
        "sections": sections,
        "section_count": len(sections),
        "file_sha256": hashlib.sha256(data).hexdigest(),
        "file_size": len(data),
        "needs_toc_confirm": False,
    }
