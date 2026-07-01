#!/usr/bin/env python3
"""EPUB → verses.json。

支持两种结构：
  • CNV（圣经新译本，cnepub epubBuilder）：每章一个 html，NCX navLabel = "新译本 - 书 - 第N章"。
  • KJV（CC20 InDesign 导出）：每卷一个 html，NCX navPoint = 书名；卷内用 Verse-Ref span 标注节号，
    节号回到 1 视为进入新一章。

用法：
  python scripts/epub_to_verses.py --epub data/bible/cnv/圣经新译本.epub \
      --translation cnv --format cnv --out data/bible/cnv/verses.json
  python scripts/epub_to_verses.py --epub "data/bible/kjv/The Holy Bible (KJV).epub" \
      --translation kjv --format kjv --out data/bible/kjv/verses.json

输出 JSON：
  {
    "translation": "cnv",
    "verses": [ {"book":"GEN","chapter":1,"verse":1,"text":"…"}, … ],
    "books":  [ {"id":"GEN","name":"创世记","testament":"OT","order":1,"chapter_count":50}, … ]
  }
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

# ─────────────────────────────────────────────────────────────
# 66 卷规范表：id（USFM 风格）、中文名、英文名（含别名）、约书、顺序
BOOKS: list[dict] = [
    ("GEN", "创世记", "Genesis", "OT", ["创世纪"]),
    ("EXO", "出埃及记", "Exodus", "OT", []),
    ("LEV", "利未记", "Leviticus", "OT", []),
    ("NUM", "民数记", "Numbers", "OT", []),
    ("DEU", "申命记", "Deuteronomy", "OT", []),
    ("JOS", "约书亚记", "Joshua", "OT", []),
    ("JDG", "士师记", "Judges", "OT", []),
    ("RUT", "路得记", "Ruth", "OT", []),
    ("1SA", "撒母耳记上", "1 Samuel", "OT", ["撒母耳记上", "撒上"]),
    ("2SA", "撒母耳记下", "2 Samuel", "OT", ["撒下"]),
    ("1KI", "列王纪上", "1 Kings", "OT", ["列王记上", "王上"]),
    ("2KI", "列王纪下", "2 Kings", "OT", ["列王记下", "王下"]),
    ("1CH", "历代志上", "1 Chronicles", "OT", ["代上"]),
    ("2CH", "历代志下", "2 Chronicles", "OT", ["代下"]),
    ("EZR", "以斯拉记", "Ezra", "OT", []),
    ("NEH", "尼希米记", "Nehemiah", "OT", []),
    ("EST", "以斯帖记", "Esther", "OT", []),
    ("JOB", "约伯记", "Job", "OT", []),
    ("PSA", "诗篇", "Psalms", "OT", ["诗"]),
    ("PRO", "箴言", "Proverbs", "OT", []),
    ("ECC", "传道书", "Ecclesiastes", "OT", []),
    ("SNG", "雅歌", "Song of Solomon", "OT", ["Song of Songs", "Song of Sol"]),
    ("ISA", "以赛亚书", "Isaiah", "OT", []),
    ("JER", "耶利米书", "Jeremiah", "OT", []),
    ("LAM", "耶利米哀歌", "Lamentations", "OT", ["哀歌", "The Lamentations",
                                          "The Lamentations of Jeremiah"]),
    ("EZK", "以西结书", "Ezekiel", "OT", []),
    ("DAN", "但以理书", "Daniel", "OT", []),
    ("HOS", "何西阿书", "Hosea", "OT", []),
    ("JOL", "约珥书", "Joel", "OT", []),
    ("AMO", "阿摩司书", "Amos", "OT", []),
    ("OBA", "俄巴底亚书", "Obadiah", "OT", []),
    ("JON", "约拿书", "Jonah", "OT", []),
    ("MIC", "弥迦书", "Micah", "OT", []),
    ("NAM", "那鸿书", "Nahum", "OT", []),
    ("HAB", "哈巴谷书", "Habakkuk", "OT", []),
    ("ZEP", "西番雅书", "Zephaniah", "OT", []),
    ("HAG", "哈该书", "Haggai", "OT", []),
    ("ZEC", "撒迦利亚书", "Zechariah", "OT", []),
    ("MAL", "玛拉基书", "Malachi", "OT", []),
    ("MAT", "马太福音", "Matthew", "NT", []),
    ("MRK", "马可福音", "Mark", "NT", []),
    ("LUK", "路加福音", "Luke", "NT", []),
    ("JHN", "约翰福音", "John", "NT", []),
    ("ACT", "使徒行传", "Acts", "NT", ["Acts Of The Apostles",
                                   "The Acts", "The Acts of the Apostles"]),
    ("ROM", "罗马书", "Romans", "NT", []),
    ("1CO", "哥林多前书", "1 Corinthians", "NT", []),
    ("2CO", "哥林多后书", "2 Corinthians", "NT", []),
    ("GAL", "加拉太书", "Galatians", "NT", []),
    ("EPH", "以弗所书", "Ephesians", "NT", []),
    ("PHP", "腓立比书", "Philippians", "NT", []),
    ("COL", "歌罗西书", "Colossians", "NT", []),
    ("1TH", "帖撒罗尼迦前书", "1 Thessalonians", "NT", []),
    ("2TH", "帖撒罗尼迦后书", "2 Thessalonians", "NT", []),
    ("1TI", "提摩太前书", "1 Timothy", "NT", []),
    ("2TI", "提摩太后书", "2 Timothy", "NT", []),
    ("TIT", "提多书", "Titus", "NT", []),
    ("PHM", "腓利门书", "Philemon", "NT", []),
    ("HEB", "希伯来书", "Hebrews", "NT", []),
    ("JAS", "雅各书", "James", "NT", []),
    ("1PE", "彼得前书", "1 Peter", "NT", []),
    ("2PE", "彼得后书", "2 Peter", "NT", []),
    ("1JN", "约翰一书", "1 John", "NT", []),
    ("2JN", "约翰二书", "2 John", "NT", []),
    ("3JN", "约翰三书", "3 John", "NT", []),
    ("JUD", "犹大书", "Jude", "NT", []),
    ("REV", "启示录", "Revelation", "NT", ["Revelation of John", "The Revelation"]),
]

BOOK_ORDER: dict[str, int] = {b[0]: i + 1 for i, b in enumerate(BOOKS)}
BOOK_TESTAMENT: dict[str, str] = {b[0]: b[3] for b in BOOKS}
BOOK_ZH_NAME: dict[str, str] = {b[0]: b[1] for b in BOOKS}


def _local(tag: str) -> str:
    """去掉 XML 命名空间，返回本地标签名。"""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s).strip().lower()


# 中/英别名 → id
ZH_LOOKUP: dict[str, str] = {}
EN_LOOKUP: dict[str, str] = {}
for _id, _zh, _en, _t, _aliases in BOOKS:
    ZH_LOOKUP[_norm(_zh)] = _id
    EN_LOOKUP[_norm(_en)] = _id
    for a in _aliases:
        if re.search(r"[\u4e00-\u9fff]", a):
            ZH_LOOKUP[_norm(a)] = _id
        else:
            EN_LOOKUP[_norm(a)] = _id


# ─────────────────────────────────────────────────────────────
# 中文数字 → int（章号，最多到几百）
_CN_DIGIT = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
             "六": 6, "七": 7, "八": 8, "九": 9}


def cn2num(s: str) -> int | None:
    s = s.strip()
    if s.isdigit():
        return int(s)
    if not s:
        return None
    total = 0
    section = 0
    for ch in s:
        if ch in _CN_DIGIT:
            section = _CN_DIGIT[ch]
        elif ch == "十":
            section = (section or 1) * 10
            total += section
            section = 0
        elif ch == "百":
            section = (section or 1) * 100
            total += section
            section = 0
        else:
            return None
    return total + section


# ─────────────────────────────────────────────────────────────
class _PCollector(HTMLParser):
    """收集每个顶层 <p> 的纯文本（CNV 用）。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paras: list[str] = []
        self._depth = 0
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "p":
            self._depth = 1
            self._buf = []

    def handle_endtag(self, tag):
        if tag == "p" and self._depth:
            self.paras.append("".join(self._buf).strip())
            self._depth = 0
            self._buf = []

    def handle_data(self, data):
        if self._depth:
            self._buf.append(data)


class _KJVCollector(HTMLParser):
    """KJV CC20：忽略 <a> 内的页眉，提取 Verse-Ref 节号与节文。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.verses: list[tuple[int, str]] = []  # (verse_num, text)
        self._a_depth = 0
        self._in_ref = False
        self._ref_buf: list[str] = []
        self._body_buf: list[str] = []
        self._cur_ref: str | None = None
        self._in_p = False

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get("class", "")
        if tag == "a":
            self._a_depth += 1
        elif tag == "p":
            self._in_p = True
            self._body_buf = []
            self._cur_ref = None
        elif tag == "span" and "Verse-Ref" in cls and self._a_depth == 0:
            self._in_ref = True
            self._ref_buf = []

    def handle_endtag(self, tag):
        if tag == "a" and self._a_depth:
            self._a_depth -= 1
        elif tag == "span" and self._in_ref:
            self._cur_ref = "".join(self._ref_buf).strip()
            self._in_ref = False
        elif tag == "p" and self._in_p:
            if self._cur_ref:
                m = re.search(r"(\d+)", self._cur_ref)
                if m:
                    text = "".join(self._body_buf)
                    text = text.replace("\u00b6", " ")  # 去段落符 ¶
                    text = re.sub(r"\s+", " ", text).strip()
                    self.verses.append((int(m.group(1)), text))
            self._in_p = False

    def handle_data(self, data):
        if self._in_ref:
            self._ref_buf.append(data)
        elif self._in_p and self._a_depth == 0:
            self._body_buf.append(data)


# ─────────────────────────────────────────────────────────────
class Epub:
    def __init__(self, path: Path) -> None:
        self.zf = zipfile.ZipFile(path)
        self.opf_path = self._opf_path()
        self.opf_dir = str(Path(self.opf_path).parent)

    def _read(self, name: str) -> bytes:
        return self.zf.read(name)

    def _resolve(self, href: str) -> str:
        href = href.split("#")[0]
        if self.opf_dir and self.opf_dir != ".":
            return f"{self.opf_dir}/{href}"
        return href

    def _opf_path(self) -> str:
        root = ET.fromstring(self._read("META-INF/container.xml"))
        for el in root.iter():
            if _local(el.tag) == "rootfile" and el.attrib.get("full-path"):
                return el.attrib["full-path"]
        raise SystemExit("container.xml 缺少 rootfile")

    def ncx_navpoints(self) -> list[tuple[str, str]]:
        """返回 [(src_href, label)]，按文档顺序。命名空间无关解析。"""
        opf = ET.fromstring(self._read(self.opf_path))
        ncx_id = None
        ncx_href = None
        for el in opf.iter():
            name = _local(el.tag)
            if name == "spine":
                ncx_id = el.attrib.get("toc")
            elif name == "item":
                if el.attrib.get("media-type") == "application/x-dtbncx+xml":
                    ncx_href = el.attrib.get("href")
        if not ncx_href and ncx_id:
            for el in opf.iter():
                if _local(el.tag) == "item" and el.attrib.get("id") == ncx_id:
                    ncx_href = el.attrib.get("href")
                    break
        if not ncx_href:
            raise SystemExit("找不到 NCX (toc)")
        ncx = ET.fromstring(self._read(self._resolve(ncx_href)))
        out: list[tuple[str, str]] = []
        for nav in ncx.iter():
            if _local(nav.tag) != "navPoint":
                continue
            label, src = None, None
            for child in nav.iter():
                lname = _local(child.tag)
                if lname == "text" and label is None:
                    label = (child.text or "").strip()
                elif lname == "content" and src is None:
                    src = child.attrib.get("src", "")
            if label and src:
                out.append((src, label))
        return out

    def read_html(self, href: str) -> str:
        return self._read(self._resolve(href)).decode("utf-8", "replace")


# ─────────────────────────────────────────────────────────────
def parse_cnv(epub: Epub) -> list[dict]:
    verses: list[dict] = []
    chap_re = re.compile(r"第(.+?)[章篇]")  # 诗篇用「篇」，其余用「章」
    for src, label in epub.ncx_navpoints():
        parts = [p.strip() for p in label.split(" - ")]
        if len(parts) < 3:
            continue
        m = chap_re.search(parts[-1])
        if not m:
            continue
        book_id = ZH_LOOKUP.get(_norm(parts[-2]))
        chap = cn2num(m.group(1))
        if not book_id or not chap:
            continue
        html = epub.read_html(src)
        col = _PCollector()
        col.feed(html)
        for para in col.paras:
            vm = re.match(r"^(\d+)[\s\u3000]+(.*)$", para)
            if not vm:
                continue
            # 保留全角空格 \u3000（神名前的敬空习惯），仅折叠普通空白
            text = re.sub(r"[ \t\r\n]+", " ", vm.group(2)).strip()
            if text:
                verses.append(
                    {"book": book_id, "chapter": chap,
                     "verse": int(vm.group(1)), "text": text}
                )
    return verses


def parse_kjv(epub: Epub) -> list[dict]:
    verses: list[dict] = []
    seen_books: set[str] = set()
    for src, label in epub.ncx_navpoints():
        book_id = EN_LOOKUP.get(_norm(label))
        if not book_id or book_id in seen_books:
            continue
        seen_books.add(book_id)
        html = epub.read_html(src)
        col = _KJVCollector()
        col.feed(html)
        chapter = 0
        prev = 0
        for vnum, text in col.verses:
            if vnum == 1 and prev != 1:
                chapter += 1
            prev = vnum
            if chapter == 0:
                chapter = 1
            if text:
                verses.append(
                    {"book": book_id, "chapter": chapter,
                     "verse": vnum, "text": text}
                )
    return verses


# ─────────────────────────────────────────────────────────────
def build_books(verses: list[dict]) -> list[dict]:
    chapters: dict[str, int] = {}
    for v in verses:
        chapters[v["book"]] = max(chapters.get(v["book"], 0), v["chapter"])
    books = []
    for book_id in sorted(chapters, key=lambda b: BOOK_ORDER.get(b, 999)):
        books.append({
            "id": book_id,
            "name": BOOK_ZH_NAME.get(book_id, book_id),
            "testament": BOOK_TESTAMENT.get(book_id, "NT"),
            "order": BOOK_ORDER.get(book_id, 999),
            "chapter_count": chapters[book_id],
        })
    return books


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--epub", required=True)
    ap.add_argument("--translation", required=True)
    ap.add_argument("--format", choices=["cnv", "kjv"], required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    epub = Epub(Path(args.epub))
    verses = parse_cnv(epub) if args.format == "cnv" else parse_kjv(epub)
    if not verses:
        raise SystemExit("未解析出任何经节，请检查 EPUB 结构")
    books = build_books(verses)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        json.dump(
            {"translation": args.translation, "verses": verses, "books": books},
            f, ensure_ascii=False,
        )

    n_books = len(books)
    n_ch = sum(b["chapter_count"] for b in books)
    print(f"✓ {args.translation}: {len(verses)} 节 / {n_ch} 章 / {n_books} 卷 → {out}")
    # 抽样校验
    def sample(bk, ch, vs):
        for v in verses:
            if v["book"] == bk and v["chapter"] == ch and v["verse"] == vs:
                return v["text"]
        return "(缺)"
    print("  GEN 1:1 =", sample("GEN", 1, 1)[:50])
    print("  JHN 3:16 =", sample("JHN", 3, 16)[:50])


if __name__ == "__main__":
    main()
