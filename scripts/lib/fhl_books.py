"""FHL 经卷编号 ↔ OSIS / 英文缩写（与 listall.html 一致）。"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

FHL_LISTALL = "https://bible.fhl.net/json/listall.html"
_CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / ".cache" / "fhl_books.json"

# bid 1–66，与 listall 顺序一致（离线兜底）
_STATIC_BOOKS: list[tuple[int, str, str, str]] = [
    (1, "Ge", "GEN", "创世记"), (2, "Ex", "EXO", "出埃及记"), (3, "Le", "LEV", "利未记"),
    (4, "Nu", "NUM", "民数记"), (5, "De", "DEU", "申命记"), (6, "Jos", "JOS", "约书亚记"),
    (7, "Jud", "JDG", "士师记"), (8, "Ru", "RUT", "路得记"), (9, "1Sa", "1SA", "撒母耳记上"),
    (10, "2Sa", "2SA", "撒母耳记下"), (11, "1Ki", "1KI", "列王纪上"), (12, "2Ki", "2KI", "列王纪下"),
    (13, "1Ch", "1CH", "历代志上"), (14, "2Ch", "2CH", "历代志下"), (15, "Ezr", "EZR", "以斯拉记"),
    (16, "Ne", "NEH", "尼希米记"), (17, "Es", "EST", "以斯帖记"), (18, "Job", "JOB", "约伯记"),
    (19, "Ps", "PSA", "诗篇"), (20, "Pr", "PRO", "箴言"), (21, "Ec", "ECC", "传道书"),
    (22, "So", "SNG", "雅歌"), (23, "Is", "ISA", "以赛亚书"), (24, "Je", "JER", "耶利米书"),
    (25, "La", "LAM", "耶利米哀歌"), (26, "Eze", "EZK", "以西结书"), (27, "Da", "DAN", "但以理书"),
    (28, "Ho", "HOS", "何西阿书"), (29, "Joe", "JOL", "约珥书"), (30, "Am", "AMO", "阿摩司书"),
    (31, "Ob", "OBA", "俄巴底亚书"), (32, "Jon", "JON", "约拿书"), (33, "Mic", "MIC", "弥迦书"),
    (34, "Na", "NAM", "那鸿书"), (35, "Hab", "HAB", "哈巴谷书"), (36, "Zep", "ZEP", "西番雅书"),
    (37, "Hag", "HAG", "哈该书"), (38, "Zec", "ZEC", "撒迦利亚书"), (39, "Mal", "MAL", "玛拉基书"),
    (40, "Mt", "MAT", "马太福音"), (41, "Mr", "MRK", "马可福音"), (42, "Lu", "LUK", "路加福音"),
    (43, "Joh", "JHN", "约翰福音"), (44, "Ac", "ACT", "使徒行传"), (45, "Ro", "ROM", "罗马书"),
    (46, "1Co", "1CO", "哥林多前书"), (47, "2Co", "2CO", "哥林多后书"), (48, "Ga", "GAL", "加拉太书"),
    (49, "Eph", "EPH", "以弗所书"), (50, "Php", "PHP", "腓立比书"), (51, "Col", "COL", "歌罗西书"),
    (52, "1Th", "1TH", "帖撒罗尼迦前书"), (53, "2Th", "2TH", "帖撒罗尼迦后书"),
    (54, "1Ti", "1TI", "提摩太前书"), (55, "2Ti", "2TI", "提摩太后书"), (56, "Tit", "TIT", "提多书"),
    (57, "Phm", "PHM", "腓利门书"), (58, "Heb", "HEB", "希伯来书"), (59, "Jas", "JAS", "雅各书"),
    (60, "1Pe", "1PE", "彼得前书"), (61, "2Pe", "2PE", "彼得后书"), (62, "1Jo", "1JN", "约翰一书"),
    (63, "2Jo", "2JN", "约翰二书"), (64, "3Jo", "3JN", "约翰三书"), (65, "Jud", "JUD", "犹大书"),
    (66, "Re", "REV", "启示录"),
]

_FHL_BOOKS: list[tuple[int, str, str, str]] | None = None
_FHL_SOURCE: str | None = None


def fhl_books_source() -> str:
    """最近一次 load_fhl_books 的数据来源：live / cache / static。"""
    return _FHL_SOURCE or "unknown"


def _osis_from_engs(engs: str) -> str:
    try:
        from lib.usfm import normalize_osis_book, osis_to_usfm_book
    except ImportError:
        from usfm import normalize_osis_book, osis_to_usfm_book

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


def _parse_listall(raw: str) -> list[tuple[int, str, str, str]]:
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
    return rows


def _save_cache(rows: list[tuple[int, str, str, str]]) -> None:
    try:
        _CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = [{"bid": b, "engs": e, "osis": o, "chinese": c} for b, e, o, c in rows]
        _CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        logger.warning("fhl books cache write failed: %s", exc)


def _load_cache() -> list[tuple[int, str, str, str]] | None:
    if not _CACHE_PATH.is_file():
        return None
    try:
        data = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
        rows = [
            (int(item["bid"]), item["engs"], item["osis"], item["chinese"])
            for item in data
        ]
        return rows or None
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None


def _fetch_live() -> list[tuple[int, str, str, str]]:
    req = urllib.request.Request(FHL_LISTALL, headers={"User-Agent": "bible-import/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    rows = _parse_listall(raw)
    if not rows:
        raise ValueError("FHL listall 返回为空")
    _save_cache(rows)
    return rows


def load_fhl_books(*, allow_offline: bool = True) -> list[tuple[int, str, str, str]]:
    """返回 [(bid, engs, osis_usfm, chinese), ...]。网络不可达时用缓存或内置表。"""
    global _FHL_BOOKS, _FHL_SOURCE
    if _FHL_BOOKS is not None:
        return _FHL_BOOKS

    try:
        _FHL_BOOKS = _fetch_live()
        _FHL_SOURCE = "live"
        return _FHL_BOOKS
    except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
        cached = _load_cache()
        if cached:
            _FHL_BOOKS = cached
            _FHL_SOURCE = "cache"
            logger.warning("FHL listall 不可达（%s），使用本地缓存", exc)
            return _FHL_BOOKS
        if allow_offline:
            _FHL_BOOKS = list(_STATIC_BOOKS)
            _FHL_SOURCE = "static"
            logger.warning("FHL listall 不可达（%s），使用内置书卷表", exc)
            return _FHL_BOOKS
        raise


def fhl_book_by_osis(osis: str) -> tuple[int, str, str, str] | None:
    target = osis.upper()
    for row in load_fhl_books():
        if row[2] == target:
            return row
    return None
