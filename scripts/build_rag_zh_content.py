#!/usr/bin/env python3
"""项目自有中文资料 → content/commentary/study-bible-zh/*.md（供 RAG 索引）。

包含：书卷/章摘要、词典词条、人生主题、地图/时间线专题。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "content" / "commentary" / "study-bible-zh"
DATA = REPO / "data"


def _has_cjk(s: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", s or ""))


def _write(name: str, body: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(body.strip() + "\n", encoding="utf-8")
    return path


def _books_and_chapters() -> None:
    books_path = DATA / "summaries" / "books.json"
    ch_path = DATA / "summaries" / "chapters.json"
    if not books_path.exists():
        return

    books = json.loads(books_path.read_text(encoding="utf-8")).get("books") or []
    lines = ["# 圣经书卷摘要\n", "language: zh\n"]
    for b in books:
        book = b.get("book", "")
        name = b.get("name", book)
        summary = (b.get("summary") or "").strip()
        if summary:
            lines.append(f"## {name} ({book})\n\n{summary}\n")

    _write("books-summary.md", "\n".join(lines))

    if not ch_path.exists():
        return
    chapters = json.loads(ch_path.read_text(encoding="utf-8")).get("chapters") or []
    by_book: dict[str, list[dict]] = {}
    for c in chapters:
        book = (c.get("book") or "").upper()
        by_book.setdefault(book, []).append(c)

    for book, items in sorted(by_book.items()):
        items.sort(key=lambda x: int(x.get("chapter") or 0))
        blines = [f"# {book} 章摘要\n"]
        for c in items:
            ch = c.get("chapter")
            summary = (c.get("summary") or "").strip()
            if ch and summary:
                blines.append(f"## {book} {ch}\n\n{summary}\n")
        _write(f"chapters-{book.lower()}.md", "\n".join(blines))


def _dictionary() -> None:
    path = DATA / "dictionary" / "entities.json"
    if not path.exists():
        return
    entities = json.loads(path.read_text(encoding="utf-8")).get("entities") or []
    lines = ["# 圣经词典（中文）\n"]
    n = 0
    for ent in entities:
        name = (ent.get("name") or "").strip()
        summary = (ent.get("summary") or "").strip()
        if not _has_cjk(name) or not _has_cjk(summary):
            continue
        disamb = (ent.get("disambiguation") or "").strip()
        label = f"{name}（{disamb}）" if disamb else name
        etype = (ent.get("type") or "").strip()
        refs = ent.get("refs") or []
        ref_str = "、".join(refs[:6])
        body = summary
        if etype:
            body = f"类型：{etype}。{body}"
        if ref_str:
            body += f"\n\n相关经文：{ref_str}"
        lines.append(f"## {label}\n\n{body}\n")
        n += 1
    if n:
        _write("dictionary-entities.md", "\n".join(lines))


def _topics() -> None:
    path = DATA / "topics" / "topics.json"
    if not path.exists():
        return
    topics = json.loads(path.read_text(encoding="utf-8")).get("topics") or []
    lines = ["# 经文与人生主题\n"]
    for t in topics:
        name = (t.get("name") or t.get("id") or "").strip()
        refs = t.get("refs") or []
        if not name:
            continue
        ref_str = "、".join(refs)
        lines.append(f"## 主题：{name}\n\n相关经节：{ref_str}\n")
    _write("topics.md", "\n".join(lines))


def _tours() -> None:
    for fname, title in (
        ("geography/map_tours.json", "地图专题"),
        ("geography/timeline_tours.json", "时间线专题"),
    ):
        path = DATA / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        key = "tours"
        tours = data.get(key) or []
        lines = [f"# {title}\n"]
        for tour in tours:
            ttitle = tour.get("title") or tour.get("id") or ""
            desc = (tour.get("description") or tour.get("subtitle") or "").strip()
            lines.append(f"## {ttitle}\n")
            if desc:
                lines.append(f"{desc}\n")
            for stop in tour.get("stops") or tour.get("events") or []:
                label = stop.get("label") or stop.get("title") or ""
                ref = stop.get("ref") or ""
                note = (stop.get("note") or stop.get("notes") or "").strip()
                year = stop.get("year") or stop.get("era") or ""
                parts = [p for p in (label, year, ref, note) if p]
                if parts:
                    lines.append(f"- {' · '.join(parts)}")
            lines.append("")
        stem = Path(fname).stem.replace("_", "-")
        _write(f"{stem}.md", "\n".join(lines))


def main() -> int:
    _books_and_chapters()
    _dictionary()
    _topics()
    _tours()
    n = len(list(OUT.glob("*.md"))) if OUT.exists() else 0
    print(f"✓ 中文自有资料 → {OUT}（{n} 个 md 文件）", flush=True)
    print("  下一步：bash scripts/ensure_rag.sh", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
