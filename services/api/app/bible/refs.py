"""经文引用（scripture_ref）解析。

支持：
  JHN.3.16 / JHN.3.16-18 / JHN.3 / JHN
  JHN 3:16 / 1JN 1:9
  约翰福音3:16 / 诗篇 23 / 约翰一书1:9
末尾「数字[:. ]数字(-数字)?」识别为 章[:节(-节)]，其余为卷标记（id 或中文名）。
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import reader

# 末尾的 章[ 节[ -节 ] ] 数字块（用 $ 锚定，天然兼容 1JN 等带前导数字的卷 id）
_TAIL = re.compile(r"(\d+)(?:[:.\s]+(\d+)(?:\s*[-~]\s*(\d+))?)?\s*$")
_FW = str.maketrans("０１２３４５６７８９：．～－", "0123456789:.~-")


@dataclass
class ScriptureRef:
    book_id: str
    book_name: str
    chapter: int | None = None
    verse_start: int | None = None
    verse_end: int | None = None

    @property
    def display(self) -> str:
        if self.chapter is None:
            return self.book_name
        base = f"{self.book_name} {self.chapter}"
        if self.verse_start is None:
            return base
        if self.verse_end and self.verse_end != self.verse_start:
            return f"{base}:{self.verse_start}-{self.verse_end}"
        return f"{base}:{self.verse_start}"

    @property
    def osis(self) -> str:
        parts = [self.book_id]
        if self.chapter is not None:
            parts.append(str(self.chapter))
        if self.verse_start is not None:
            parts.append(str(self.verse_start))
        return ".".join(parts)


def parse_ref(raw: str) -> ScriptureRef | None:
    s = (raw or "").strip().translate(_FW)
    if not s:
        return None

    m = _TAIL.search(s)
    chapter = verse_start = verse_end = None
    book_token = s
    if m:
        book_token = s[: m.start()].strip(" .:：~-")
        chapter = int(m.group(1))
        if m.group(2):
            verse_start = int(m.group(2))
        if m.group(3):
            verse_end = int(m.group(3))
    if not book_token:
        return None

    book = reader.resolve_book(book_token)
    if not book:
        return None
    return ScriptureRef(
        book_id=book["id"],
        book_name=book["name"],
        chapter=chapter,
        verse_start=verse_start,
        verse_end=verse_end,
    )
