"""FHL 经卷编号 ↔ OSIS / 英文缩写（与 listall.html 一致）。"""
from __future__ import annotations

import urllib.request

FHL_LISTALL = "https://bible.fhl.net/json/listall.html"

# bid → (engs, osis, chinese)
_FHL_BOOKS: list[tuple[int, str, str, str]] | None = None


def _osis_from_engs(engs: str) -> str:
    try:
        from lib.usfm import normalize_osis_book, osis_to_usfm_book
    except ImportError:
        from usfm import normalize_osis_book, osis_to_usfm_book

    # listall 短码：Ge Ex … Joh；normalize_osis 可处理常见别名
    alias = {
        "Ge": "Gen", "Ex": "Exod", "Le": "Lev", "Nu": "Num", "De": "Deut",
        "Jos": "Josh", "Jud": "Judg", "Ru": "Ruth", "1Sa": "1Sam", "2Sa": "2Sam",
        "1Ki": "1Kgs", "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr",
        "Ezr": "Ezra", "Ne": "Neh", "Es": "Esth", "Job": "Job", "Ps": "Ps",
        "Pr": "Prov", "Ec": "Eccl", "So": "Song", "Is": "Isa", "Je": "Jer",
        "La": "Lam", "Eze": "Ezek", "Da": "Dan", "Ho": "Hos", "Joe": "Joel",
        "Am": "Amos", "Ob": "Obad", "Jon": "Jonah", "Mic": "Mic", "Na": "Nah",
        "Hab": "Hab", "Zep": "Zeph", "Hag": "Hag", "Zec": "Zech", "Mal": "Mal",
        "Mt": "Matt", "Mr": "Mark", "Lu": "Luke", "Joh": "John", "Ac": "Acts",
        "Ro": "Rom", "1Co": "1Cor", "2Co": "2Cor", "Ga": "Gal", "Eph": "Eph",
        "Php": "Phil", "Col": "Col", "1Th": "1Thess", "2Th": "2Thess",
        "1Ti": "1Tim", "2Ti": "2Tim", "Tit": "Titus", "Phm": "Phlm",
        "Heb": "Heb", "Jas": "Jas", "1Pe": "1Pet", "2Pe": "2Pet",
        "1Jo": "1John", "2Jo": "2John", "3Jo": "3John", "Jud": "Jude",
        "Re": "Rev",
    }
    key = engs.strip()
    osis = alias.get(key, key)
    norm = normalize_osis_book(osis)
    if norm:
        usfm = osis_to_usfm_book(norm)
        if usfm:
            return usfm
    return key.upper()[:3]


def load_fhl_books() -> list[tuple[int, str, str, str]]:
    """返回 [(bid, engs, osis_usfm, chinese), ...]。"""
    global _FHL_BOOKS
    if _FHL_BOOKS is not None:
        return _FHL_BOOKS

    req = urllib.request.Request(FHL_LISTALL, headers={"User-Agent": "bible-import/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="replace")

    rows: list[tuple[int, str, str, str]] = []
    for line in raw.strip().splitlines():
        parts = line.split(",")
        if len(parts) < 5:
            continue
        try:
            bid = int(parts[0])
        except ValueError:
            continue
        engs = parts[5].strip() if len(parts) > 5 else parts[1].strip()
        chinese = parts[4].strip() if len(parts) > 4 else parts[3].strip()
        osis = _osis_from_engs(engs)
        rows.append((bid, engs, osis, chinese))
    _FHL_BOOKS = rows
    return rows


def fhl_book_by_osis(osis: str) -> tuple[int, str, str, str] | None:
    target = osis.upper()
    for row in load_fhl_books():
        if row[2] == target:
            return row
    return None
