#!/usr/bin/env python3
"""和合本（CUVS 简体）→ verses.json + SQLite。

数据源：midvash bible-data cuvs.json (public domain)

用法：
  python scripts/import_cuv.py
  python scripts/import_cuv.py --input data/.cache/cuvs.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sqlite3
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache" / "cuvs.json"
OUT_DIR = REPO / "data" / "bible" / "cuvs"
OUT_JSON = OUT_DIR / "verses.json"
OUT_SQLITE = REPO / "build" / "bible_cuvs.sqlite"
CUVS_URL = (
    "https://raw.githubusercontent.com/midvash/bible-data/main/versions/zh/cuvs/cuvs.json"
)

# midvash book slug → USFM
SLUG_TO_USFM: dict[str, str] = {
    "Gen": "GEN", "Exod": "EXO", "Exo": "EXO", "Lev": "LEV", "Num": "NUM", "Deut": "DEU",
    "Josh": "JOS", "Judg": "JDG", "Ruth": "RUT", "1Sam": "1SA", "2Sam": "2SA",
    "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH", "Ezra": "EZR",
    "Neh": "NEH", "Esth": "EST", "Job": "JOB", "Ps": "PSA", "Prov": "PRO",
    "Eccl": "ECC", "Song": "SNG", "Isa": "ISA", "Jer": "JER", "Lam": "LAM",
    "Ezek": "EZK", "Dan": "DAN", "Hos": "HOS", "Joel": "JOL", "Amos": "AMO",
    "Obad": "OBA", "Jonah": "JON", "Mic": "MIC", "Nah": "NAM", "Hab": "HAB",
    "Zeph": "ZEP", "Hag": "HAG", "Zech": "ZEC", "Mal": "MAL",
    "Matt": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT",
    "Rom": "ROM", "1Cor": "1CO", "2Cor": "2CO", "Gal": "GAL", "Eph": "EPH",
    "Phil": "PHP", "Col": "COL", "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI",
    "2Tim": "2TI", "Titus": "TIT", "Phlm": "PHM", "Heb": "HEB", "Jas": "JAS",
    "1Pet": "1PE", "2Pet": "2PE", "1John": "1JN", "2John": "2JN", "3John": "3JN",
    "Jude": "JUD", "Rev": "REV",
}

CN_NAMES: dict[str, str] = {
    "GEN": "创世记", "EXO": "出埃及记", "LEV": "利未记", "NUM": "民数记", "DEU": "申命记",
    "JOS": "约书亚记", "JDG": "士师记", "RUT": "路得记", "1SA": "撒母耳记上", "2SA": "撒母耳记下",
    "1KI": "列王纪上", "2KI": "列王纪下", "1CH": "历代志上", "2CH": "历代志下", "EZR": "以斯拉记",
    "NEH": "尼希米记", "EST": "以斯帖记", "JOB": "约伯记", "PSA": "诗篇", "PRO": "箴言",
    "ECC": "传道书", "SNG": "雅歌", "ISA": "以赛亚书", "JER": "耶利米书", "LAM": "耶利米哀歌",
    "EZK": "以西结书", "DAN": "但以理书", "HOS": "何西阿书", "JOL": "约珥书", "AMO": "阿摩司书",
    "OBA": "俄巴底亚书", "JON": "约拿书", "MIC": "弥迦书", "NAM": "那鸿书", "HAB": "哈巴谷书",
    "ZEP": "西番雅书", "HAG": "哈该书", "ZEC": "撒迦利亚书", "MAL": "玛拉基书", "MAT": "马太福音",
    "MRK": "马可福音", "LUK": "路加福音", "JHN": "约翰福音", "ACT": "使徒行传", "ROM": "罗马书",
    "1CO": "哥林多前书", "2CO": "哥林多后书", "GAL": "加拉太书", "EPH": "以弗所书", "PHP": "腓立比书",
    "COL": "歌罗西书", "1TH": "帖撒罗尼迦前书", "2TH": "帖撒罗尼迦后书", "1TI": "提摩太前书",
    "2TI": "提摩太后书", "TIT": "提多书", "PHM": "腓利门书", "HEB": "希伯来书", "JAS": "雅各书",
    "1PE": "彼得前书", "2PE": "彼得后书", "1JN": "约翰一书", "2JN": "约翰二书", "3JN": "约翰三书",
    "JUD": "犹大书", "REV": "启示录",
}


def _ensure_cuvs(path: Path) -> None:
    if path.exists() and path.stat().st_size > 1_000_000:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"  下载 {CUVS_URL} …")
    urllib.request.urlretrieve(CUVS_URL, path)


def _parse_midvash(data: dict) -> tuple[list[dict], list[dict]]:
    verses: list[dict] = []
    books_meta: list[dict] = []
    for i, book in enumerate(data.get("books") or [], start=1):
        slug = book.get("book") or ""
        usfm = SLUG_TO_USFM.get(slug) or slug.upper()
        chapters = book.get("chapters") or []
        books_meta.append({
            "id": usfm,
            "name": CN_NAMES.get(usfm, book.get("englishName", usfm)),
            "testament": book.get("testament") or ("OT" if i <= 39 else "NT"),
            "order": i,
            "chapter_count": len(chapters),
        })
        for ch in chapters:
            ci = ch.get("chapter") or 0
            for v in ch.get("verses") or []:
                verses.append({
                    "book": usfm,
                    "chapter": int(ci),
                    "verse": int(v.get("number") or 0),
                    "text": str(v.get("text") or "").strip(),
                })
    return verses, books_meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=CACHE)
    args = ap.parse_args()

    _ensure_cuvs(args.input)
    data = json.loads(args.input.read_text(encoding="utf-8"))
    verses, books_meta = _parse_midvash(data)

    payload = {"translation": "cuvs", "verses": verses, "books": books_meta}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    OUT_SQLITE.parent.mkdir(parents=True, exist_ok=True)
    if OUT_SQLITE.exists():
        OUT_SQLITE.unlink()
    spec = importlib.util.spec_from_file_location("import_bible", REPO / "scripts" / "import_bible.py")
    ib = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ib)
    conn = sqlite3.connect(OUT_SQLITE)
    conn.executescript(ib.SCHEMA)
    conn.executemany(
        "INSERT INTO books (id, name, testament, sort_order, chapter_count) VALUES (?,?,?,?,?)",
        [(b["id"], b["name"], b["testament"], b["order"], b["chapter_count"]) for b in books_meta],
    )
    conn.executemany(
        "INSERT INTO verses (book, chapter, verse, text) VALUES (?,?,?,?)",
        [(v["book"], v["chapter"], v["verse"], v["text"]) for v in verses if v["text"]],
    )
    conn.executemany(
        "INSERT INTO verses_fts (text, book, chapter, verse) VALUES (?,?,?,?)",
        [(v["text"], v["book"], v["chapter"], v["verse"]) for v in verses if v["text"]],
    )
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('translation', 'cuvs')")
    conn.commit()
    conn.close()

    print(f"✓ 和合本：{len(verses)} 节 / {len(books_meta)} 卷 → {OUT_JSON}")
    print(f"  SQLite → {OUT_SQLITE} ({OUT_SQLITE.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
