"""OSIS ↔ USFM book id conversion and reference parsing."""
from __future__ import annotations

import re
from dataclasses import dataclass

# OSIS 3-letter → USFM (project epub_to_verses.py BOOKS table)
OSIS_TO_USFM: dict[str, str] = {
    "Gen": "GEN", "Exod": "EXO", "Lev": "LEV", "Num": "NUM", "Deut": "DEU",
    "Josh": "JOS", "Judg": "JDG", "Ruth": "RUT", "1Sam": "1SA", "2Sam": "2SA",
    "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH", "Ezra": "EZR",
    "Neh": "NEH", "Esth": "EST", "Job": "JOB", "Ps": "PSA", "Prov": "PRO",
    "Eccl": "ECC", "Song": "SNG", "Isa": "ISA", "Jer": "JER", "Lam": "LAM",
    "Ezek": "EZK", "Dan": "DAN", "Hos": "HOS", "Joel": "JOL", "Amos": "AMO",
    "Obad": "OBA", "Jonah": "JON", "Mic": "MIC", "Nah": "NAM", "Hab": "HAB",
    "Zeph": "ZEP", "Hag": "HAG", "Zech": "ZEC", "Mal": "MAL",
    "Matt": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT",
    "Rom": "ROM", "1Cor": "1CO", "2Cor": "2CO", "Gal": "GAL", "Eph": "EPH",
    "Phil": "PHP", "Col": "COL", "1Thess": "1TH", "2Thess": "2TH",
    "1Tim": "1TI", "2Tim": "2TI", "Titus": "TIT", "Phlm": "PHM", "Heb": "HEB",
    "Jas": "JAS", "1Pet": "1PE", "2Pet": "2PE", "1John": "1JN", "2John": "2JN",
    "3John": "3JN", "Jude": "JUD", "Rev": "REV",
}
USFM_TO_OSIS = {v: k for k, v in OSIS_TO_USFM.items()}

# midvash / alternate spellings
_OSIS_ALIASES: dict[str, str] = {
    "1Chron": "1Chr", "2Chron": "2Chr", "Psalm": "Ps", "Psalms": "Ps",
    "Proverbs": "Prov", "Ecclesiastes": "Eccl", "Revelation": "Rev",
    "Matthew": "Matt", "Mat": "Matt", "Mar": "Mark", "Mk": "Mark", "Mrk": "Mark",
    "Luk": "Luke", "Jn": "John", "Jhn": "John",
    "1Thes": "1Thess", "2Thes": "2Thess",
    "1Timothy": "1Tim", "2Timothy": "2Tim", "Philemon": "Phlm",
    "1Peter": "1Pet", "2Peter": "2Pet", "James": "Jas",
    # STEPBible OT 三字母缩写
    "Gen": "Gen", "Exo": "Exod", "Deu": "Deut", "Jos": "Josh", "Jdg": "Judg",
    "Rut": "Ruth", "Psa": "Ps", "Pro": "Prov", "Sng": "Song", "Ecc": "Eccl",
    "Isa": "Isa", "Jer": "Jer", "Lam": "Lam", "Ezk": "Ezek", "Dan": "Dan",
    "Hos": "Hos", "Jol": "Joel", "Amo": "Amos", "Obad": "Obad", "Jon": "Jonah",
    "Mic": "Mic", "Nam": "Nah", "Hab": "Hab", "Zep": "Zeph", "Hag": "Hag",
    "Zec": "Zech", "Mal": "Mal",
}

_REF = re.compile(
    r"^(?P<book>[A-Za-z0-9]+)\.(?P<chapter>\d+)\.(?P<verse>\d+)$"
)
_RANGE = re.compile(
    r"^(?P<book>[A-Za-z0-9]+)\.(?P<ch>\d+)\.(?P<v1>\d+)-(?P<book2>[A-Za-z0-9]+)\.(?P<ch2>\d+)\.(?P<v2>\d+)$"
)


@dataclass(frozen=True)
class VerseCoord:
    book: str
    chapter: int
    verse: int

    @property
    def usfm_ref(self) -> str:
        return f"{self.book} {self.chapter}:{self.verse}"


def normalize_osis_book(token: str) -> str | None:
    t = token.strip()
    if not t:
        return None
    if t in OSIS_TO_USFM:
        return t
    if t in _OSIS_ALIASES:
        return _OSIS_ALIASES[t]
    # Title-case attempt: john → John
    tc = t[0].upper() + t[1:] if t else t
    if tc in OSIS_TO_USFM:
        return tc
    if tc in _OSIS_ALIASES:
        return _OSIS_ALIASES[tc]
    return None


def osis_to_usfm_book(osis: str) -> str | None:
    norm = normalize_osis_book(osis)
    return OSIS_TO_USFM.get(norm) if norm else None


def parse_osis_ref(raw: str) -> VerseCoord | None:
    """Parse Gen.1.1 or Gen.1.1-Gen.1.3 (uses start verse)."""
    s = (raw or "").strip()
    if not s:
        return None
    m = _RANGE.match(s)
    if m:
        s = f"{m.group('book')}.{m.group('ch')}.{m.group('v1')}"
    m = _REF.match(s)
    if not m:
        return None
    book = osis_to_usfm_book(m.group("book"))
    if not book:
        return None
    return VerseCoord(book, int(m.group("chapter")), int(m.group("verse")))


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "-", name.strip().lower())
    return re.sub(r"-+", "-", s).strip("-") or "item"
