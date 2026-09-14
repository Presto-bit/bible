#!/usr/bin/env python3
"""从 NIV EPUB 抽取段落小标题 → data/bible/niv/sections.json。

NIV 正文里 sectional headings（calibre_9）与节号（calibre7 / 段首数字）按阅读顺序交错；
本脚本按 spine 顺序扫描，把每个标题关联到其后出现的第一节。
"""
from __future__ import annotations

import argparse
import json
import re
import zipfile
from html import unescape
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EPUB = ROOT / "data/bible/niv/Holy_Bible_NIV.epub"
DEFAULT_VERSES = ROOT / "data/bible/niv/verses.json"
DEFAULT_OUT = ROOT / "data/bible/niv/sections.json"

SKIP_TITLES = {
    "footnotes",
    "navigation",
    "table of contents",
    "contents",
    "old testament",
    "new testament",
    "holy bible",
    "niv",
    "the holy bible",
    "new international version",
}
SKIP_PREFIXES = ("book i", "book ii", "book iii", "book iv", "book v")

CHAPTER_RE = re.compile(r"^(?P<name>.+?)\s+(?P<ch>\d+)\s*$", re.I)
# TOC-ish: bare "Genesis 1" as calibre_9 between books
BARE_CHAPTER_RE = re.compile(
    r"^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|"
    r"1 Samuel|2 Samuel|1 Kings|2 Kings|1 Chronicles|2 Chronicles|Ezra|Nehemiah|"
    r"Esther|Job|Psalm|Psalms|Proverbs|Ecclesiastes|Song of Songs|Song of Solomon|"
    r"Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|"
    r"Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|"
    r"Matthew|Mark|Luke|John|Acts|Romans|1 Corinthians|2 Corinthians|Galatians|"
    r"Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|"
    r"1 Timothy|2 Timothy|Titus|Philemon|Hebrews|James|1 Peter|2 Peter|"
    r"1 John|2 John|3 John|Jude|Revelation)\s+\d+$",
    re.I,
)


def _local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _strip(html_frag: str) -> str:
    t = re.sub(r"<[^>]+>", "", html_frag)
    t = unescape(re.sub(r"\s+", " ", t)).strip()
    return re.sub(r"\[\d+\]", "", t).strip()


def _spine_htmls(zf: zipfile.ZipFile) -> list[str]:
    container = ET.fromstring(zf.read("META-INF/container.xml"))
    rootfile = None
    for el in container.iter():
        if _local(el.tag) == "rootfile":
            rootfile = el
            break
    if rootfile is None:
        raise RuntimeError("EPUB missing rootfile")
    opf_path = rootfile.attrib["full-path"]
    opf = ET.fromstring(zf.read(opf_path))
    manifest: dict[str, str] = {}
    for item in opf.iter():
        if _local(item.tag) == "item":
            iid = item.attrib.get("id")
            href = item.attrib.get("href")
            if iid and href:
                manifest[iid] = href
    base = str(Path(opf_path).parent)
    if base == ".":
        base = ""
    out: list[str] = []
    for itemref in opf.iter():
        if _local(itemref.tag) != "itemref":
            continue
        href = manifest.get(itemref.attrib.get("idref", ""))
        if not href:
            continue
        path = f"{base}/{href}" if base and not href.startswith(base) else href
        path = path.replace("\\", "/").lstrip("./")
        if path.endswith((".html", ".xhtml", ".htm")):
            out.append(path)
    return out


def _resolve(zf: zipfile.ZipFile, path: str) -> str:
    if path in zf.namelist():
        return path
    alt = path.split("/")[-1]
    for n in zf.namelist():
        if n.endswith(alt):
            return n
    raise KeyError(path)


def _name_to_id(verses_path: Path) -> dict[str, str]:
    books = json.loads(verses_path.read_text(encoding="utf-8"))["books"]
    m = {str(b["name"]).lower(): str(b["id"]) for b in books}
    m.update(
        {
            "psalm": "PSA",
            "psalms": "PSA",
            "song of songs": "SNG",
            "song of solomon": "SNG",
            "revelation": "REV",
            "philemon": "PHM",
        }
    )
    return m


def extract(epub: Path, verses_path: Path) -> dict:
    name_to_id = _name_to_id(verses_path)
    chapters: dict[str, list[dict]] = {}
    cur_book: str | None = None
    cur_ch: int | None = None
    pending: str | None = None
    total = 0
    skipped = 0

    # 顺序事件：章节标题 / 段落标题 / 节号（calibre7 或纯文本段首）
    block_re = re.compile(
        r"<p([^>]*)>([\s\S]*?)</p>|"
        r"<blockquote([^>]*)>([\s\S]*?)</blockquote>",
        re.I,
    )
    verse_span_re = re.compile(
        r'<span class="calibre7">\s*(\d{1,3})\s*</span>',
        re.I,
    )
    verse_start_re = re.compile(r"^(\d{1,3})(?!\d)")

    def commit(verse: int) -> None:
        nonlocal pending, total
        if not pending or not cur_book or not cur_ch:
            return
        key = f"{cur_book}.{cur_ch}"
        bucket = chapters.setdefault(key, [])
        if not any(x["verse"] == verse and x["title"] == pending for x in bucket):
            bucket.append({"verse": verse, "title": pending})
            total += 1
        pending = None

    with zipfile.ZipFile(epub) as zf:
        for path in _spine_htmls(zf):
            raw = zf.read(_resolve(zf, path)).decode("utf-8", "ignore")
            body = re.sub(r"<style[\s\S]*?</style>", "", raw, flags=re.I)
            for m in block_re.finditer(body):
                if m.group(1) is not None:
                    attrs, inner = m.group(1), m.group(2)
                else:
                    attrs, inner = m.group(3) or "", m.group(4)
                cls_m = re.search(r'class="([^"]*)"', attrs or "")
                cls = (cls_m.group(1) if cls_m else "").strip()
                text = _strip(inner)
                # 节号优先（同一块里可能先有 calibre7）
                for vm in verse_span_re.finditer(inner):
                    commit(int(vm.group(1)))
                    break
                else:
                    if text:
                        vm2 = verse_start_re.match(text)
                        if vm2:
                            commit(int(vm2.group(1)))

                if not text:
                    continue

                if "calibre_10" in cls or cls.endswith("_10"):
                    cm = CHAPTER_RE.match(text)
                    if cm:
                        name = cm.group("name").strip().lower()
                        bid = name_to_id.get(name)
                        if not bid and name.startswith("psalm"):
                            bid = "PSA"
                        if bid:
                            cur_book = bid
                            cur_ch = int(cm.group("ch"))
                            pending = None
                    continue

                if "calibre_9" in cls or cls.endswith("_9"):
                    low = text.lower()
                    if low in SKIP_TITLES or any(low.startswith(p) for p in SKIP_PREFIXES):
                        skipped += 1
                        pending = None
                        continue
                    if BARE_CHAPTER_RE.match(text):
                        skipped += 1
                        pending = None
                        continue
                    if len(text) > 120:
                        skipped += 1
                        pending = None
                        continue
                    pending = text

    # 章内按节排序
    for key, marks in chapters.items():
        marks.sort(key=lambda x: (x["verse"], x["title"]))

    return {
        "translation": "niv",
        "schema": "sections@1",
        "chapters": dict(sorted(chapters.items(), key=lambda kv: kv[0])),
        "count": total,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--epub", type=Path, default=DEFAULT_EPUB)
    ap.add_argument("--verses", type=Path, default=DEFAULT_VERSES)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    if not args.epub.exists():
        print(f"missing {args.epub}")
        return 1
    if not args.verses.exists():
        print(f"missing {args.verses}")
        return 1
    payload = extract(args.epub, args.verses)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    ch = payload["chapters"]
    print(f"✓ {payload['count']} marks / {len(ch)} chapters → {args.out}")
    for sample in ("GEN.1", "MAT.5", "JHN.3"):
        print(f"  {sample}: {ch.get(sample)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
