#!/usr/bin/env python3
"""把注释类 EPUB 抽取为按章节切分的 Markdown，供 rag_index.py 入库。

按 NCX 目录顺序读取每个 (x)html 文档，去标签取可见文本，
以目录标签作为 `# 标题` 写出到 content/commentary/extracted/NNN-<label>.md。

用法：
  python scripts/commentary_to_md.py \
    --epub "content/commentary/新约圣经背景注释·旧约圣经背景注释....epub" \
    --out content/commentary/extracted
"""
from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from epub_to_verses import Epub  # noqa: E402

_SKIP = {"script", "style", "head", "title"}
_BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"}


def _clean(raw: str) -> str:
    raw = re.sub(r"[ \t\u00a0]+", " ", raw)
    raw = re.sub(r"\n[ \t]*\n[ \t\n]*", "\n\n", raw)
    return raw.strip()


class _TextExtractor(HTMLParser):
    """抽取可见文本，并记录目标锚点 id 在 parts 序列中的位置，用于按锚点切段。"""

    def __init__(self, anchors: set[str] | None = None) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self.parts: list[str] = []
        self._anchors = anchors or set()
        self.anchor_at: dict[str, int] = {}

    def handle_starttag(self, tag: str, attrs):
        if tag in _SKIP:
            self._skip_depth += 1
        elif tag in _BLOCK:
            self.parts.append("\n")
        if self._anchors:
            for k, v in attrs:
                if k in ("id", "name") and v in self._anchors and v not in self.anchor_at:
                    self.anchor_at[v] = len(self.parts)

    def handle_startendtag(self, tag: str, attrs):
        # 自闭合锚点如 <a id="x"/>
        if self._anchors:
            for k, v in attrs:
                if k in ("id", "name") and v in self._anchors and v not in self.anchor_at:
                    self.anchor_at[v] = len(self.parts)

    def handle_endtag(self, tag: str):
        if tag in _SKIP and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag in _BLOCK:
            self.parts.append("\n")

    def handle_data(self, data: str):
        if self._skip_depth == 0 and data:
            self.parts.append(data)

    def text(self) -> str:
        return _clean("".join(self.parts))

    def segment_text(self, start: int, end: int) -> str:
        return _clean("".join(self.parts[start:end]))


def _slug(label: str) -> str:
    s = re.sub(r"[\s/\\:：]+", "_", label.strip())
    s = re.sub(r"[^\w\u4e00-\u9fff_-]", "", s)
    return s[:60] or "section"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epub", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--min-chars", type=int, default=40, help="低于此长度的文档跳过")
    args = ap.parse_args()

    epub = Epub(args.epub)
    args.out.mkdir(parents=True, exist_ok=True)

    nav = epub.ncx_navpoints()
    # 按 html 文件分组（保序），保留同一文件内的全部 (anchor, label)，用于按锚点切段。
    groups: list[tuple[str, list[tuple[str | None, str]]]] = []
    index_by_base: dict[str, int] = {}
    for src, label in nav:
        base = src.split("#")[0]
        anchor = src.split("#")[1] if "#" in src else None
        if base not in index_by_base:
            index_by_base[base] = len(groups)
            groups.append((base, []))
        groups[index_by_base[base]][1].append((anchor, label))

    seq = 0
    written = 0
    for href, sections in groups:
        try:
            html = epub.read_html(href)
        except Exception as exc:
            print(f"  跳过 {href}: {exc}")
            continue
        anchors = {a for a, _ in sections if a}
        ex = _TextExtractor(anchors=anchors)
        ex.feed(html)

        # 计算每段在 parts 中的起止位置
        n = len(ex.parts)
        bounds: list[tuple[str, int]] = []  # (label, start_index)
        for anchor, label in sections:
            start = ex.anchor_at.get(anchor, 0) if anchor else 0
            bounds.append((label, start))
        # 仅保留单调递增的边界（未命中的锚点回退为 0 会导致顺序错乱，过滤之）
        norm: list[tuple[str, int]] = []
        last = -1
        for label, start in bounds:
            if start >= last:
                norm.append((label, start))
                last = start
            else:
                # 锚点未命中：并入上一段（避免重复全文）
                continue

        for j, (label, start) in enumerate(norm):
            end = norm[j + 1][1] if j + 1 < len(norm) else n
            body = ex.segment_text(start, end)
            if len(body) < args.min_chars:
                continue
            md = f"# {label}\n\n{body}\n"
            out_path = args.out / f"{seq:04d}-{_slug(label)}.md"
            out_path.write_text(md, encoding="utf-8")
            seq += 1
            written += 1

    print(f"完成：从 {len(groups)} 个文档按锚点切出 {written} 个 .md → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
