"""只读访问离线经文 SQLite（books / verses / verses_fts）。

后端用它取经文文本与卷名（构造指南检索查询、过滤注释）。连接为只读、按需打开。
"""
from __future__ import annotations

import sqlite3
from functools import lru_cache
from pathlib import Path

from ..config import get_settings


# 译本注册表：id → 展示名。主译本提供卷名/目录，其余供对照。
# NIV 无授权源时不注册，避免前端展示不可用项。
VERSIONS: dict[str, str] = {
    "cuvs": "和合本",
    "cnv": "新译本",
    "contemporary": "当代译本",
    "kjv": "King James Version",
}
PRIMARY_VERSION = "cuvs"


def _db_path(version: str) -> Path:
    s = get_settings()
    if version == "kjv":
        return Path(s.bible_kjv_db_path)
    if version == "cuvs":
        return Path(s.bible_cuvs_db_path)
    if version == "contemporary":
        return Path(s.bible_contemporary_db_path)
    return Path(s.bible_db_path)


def _version_has_verses(vid: str) -> bool:
    path = _db_path(vid)
    if not path.exists() or path.stat().st_size < 1024:
        return False
    try:
        with _connect(vid) as conn:
            n = conn.execute("SELECT COUNT(*) FROM verses").fetchone()[0]
            return int(n) > 0
    except (sqlite3.OperationalError, FileNotFoundError):
        return False


def available_versions() -> list[dict]:
    """列出已落地且有经文的译本，主译本排首位；无源译本不返回。"""
    out: list[dict] = []
    for vid, label in VERSIONS.items():
        ok = _version_has_verses(vid)
        if not ok and vid != PRIMARY_VERSION:
            continue
        out.append(
            {
                "id": vid,
                "label": label,
                "available": ok,
                "primary": vid == PRIMARY_VERSION,
            }
        )
    out.sort(key=lambda v: (not v["primary"], not v["available"]))
    return out


def _connect(version: str = PRIMARY_VERSION) -> sqlite3.Connection:
    path = _db_path(version)
    if not path.exists():
        raise FileNotFoundError(
            f"经文库不存在：{path}（先跑 scripts/import_bible.py 生成 build/bible_{version}.sqlite）"
        )
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


@lru_cache(maxsize=1)
def list_books() -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, name, testament, sort_order, chapter_count "
            "FROM books ORDER BY sort_order"
        ).fetchall()
    return [dict(r) for r in rows]


@lru_cache(maxsize=1)
def _book_index() -> dict[str, dict]:
    idx: dict[str, dict] = {}
    for b in list_books():
        idx[b["id"].upper()] = b
        idx[b["name"]] = b
    return idx


def book_name(book_id: str) -> str | None:
    b = _book_index().get((book_id or "").upper())
    return b["name"] if b else None


def resolve_book(token: str) -> dict | None:
    """按卷 id（JHN）或中文名（约翰福音）解析。"""
    token = (token or "").strip()
    return _book_index().get(token.upper()) or _book_index().get(token)


def get_chapter(book_id: str, chapter: int, version: str = PRIMARY_VERSION) -> list[dict]:
    with _connect(version) as conn:
        rows = conn.execute(
            "SELECT verse, text FROM verses WHERE book=? AND chapter=? ORDER BY verse",
            (book_id.upper(), int(chapter)),
        ).fetchall()
    return [{"verse": r["verse"], "text": r["text"]} for r in rows]


def compare_verse(book_id: str, chapter: int, verse: int) -> dict:
    """同一节经文跨译本对照。缺失的译本会被跳过。"""
    book_id = book_id.upper()
    name = book_name(book_id) or book_id
    rows: list[dict] = []
    for v in available_versions():
        if not v["available"]:
            continue
        try:
            with _connect(v["id"]) as conn:
                r = conn.execute(
                    "SELECT text FROM verses WHERE book=? AND chapter=? AND verse=?",
                    (book_id, int(chapter), int(verse)),
                ).fetchone()
        except (sqlite3.OperationalError, FileNotFoundError):
            continue
        if r is not None:
            rows.append({"version": v["id"], "label": v["label"], "text": r["text"]})
    return {
        "ref": f"{name} {chapter}:{verse}",
        "osis": f"{book_id}.{chapter}.{verse}",
        "book": book_id,
        "chapter": int(chapter),
        "verse": int(verse),
        "versions": rows,
    }


def get_verses(
    book_id: str,
    chapter: int,
    start: int,
    end: int | None = None,
    version: str = PRIMARY_VERSION,
) -> list[dict]:
    end = end if end is not None else start
    with _connect(version) as conn:
        rows = conn.execute(
            "SELECT verse, text FROM verses WHERE book=? AND chapter=? AND verse BETWEEN ? AND ? "
            "ORDER BY verse",
            (book_id.upper(), int(chapter), int(start), int(end)),
        ).fetchall()
    return [{"verse": r["verse"], "text": r["text"]} for r in rows]


def _too_short(q: str) -> bool:
    """含中日韩字符时允许单字搜索；纯拉丁词需至少 2 字符。"""
    has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in q)
    return len(q) < (1 if has_cjk else 2)


import re as _re

# 卷书前缀：支持中文「书卷:」「卷:」与英文「book:/in:」。
_BOOK_PREFIX = _re.compile(r"^(?:book|in|书卷|卷|经卷)[:：]", _re.IGNORECASE)
_PHRASE = _re.compile(r'"([^"]+)"|“([^”]+)”')


def parse_query(raw: str) -> dict:
    """解析高级检索语法：
      • "短语" / “短语” → 整体精确匹配（作为一个 include 词）；
      • -词 / －词       → 排除词（NOT LIKE）；
      • 书卷:约翰福音 / book:JHN → 限定卷书；
      • 其余空白分隔的词  → AND 匹配的 include 词。
    返回 {includes, excludes, book_id}。"""
    raw = (raw or "").strip()
    includes: list[str] = []
    excludes: list[str] = []
    book_id: str | None = None

    # 1) 抽取引号短语
    def _take_phrase(m: "_re.Match") -> str:
        includes.append((m.group(1) or m.group(2)).strip())
        return " "

    rest = _PHRASE.sub(_take_phrase, raw)

    # 2) 逐 token 处理前缀/排除
    for tok in rest.split():
        if not tok:
            continue
        if _BOOK_PREFIX.match(tok):
            val = _BOOK_PREFIX.sub("", tok).strip()
            b = resolve_book(val)
            if b:
                book_id = b["id"].upper()
            continue
        if tok[0] in "-－" and len(tok) > 1:
            excludes.append(tok[1:].strip())
            continue
        includes.append(tok)

    includes = [t for t in includes if t]
    excludes = [t for t in excludes if t]
    return {"includes": includes, "excludes": excludes, "book_id": book_id}


def search_verses(
    q: str,
    *,
    limit: int = 24,
    offset: int = 0,
    version: str | None = None,
    testament: str | None = None,
) -> dict:
    """经文检索（自动选库 + 高级语法）：
      • 含中文 → 查 CNV，LIKE 子串匹配（FTS5 默认分词器对 CJK 不友好）；
      • 纯拉丁词 → 查 KJV（若已落地），LIKE 子串匹配（支持多词 AND / 排除 / 卷书限定）。
      • version / testament 可显式指定译本与新旧约。
    支持语法：引号短语、-排除词、书卷:/book: 限定卷书。
    返回 hits / total / total_ot / total_nt，供前端分页与约别提示。
    """
    q = (q or "").strip()
    empty = {"hits": [], "total": 0, "total_ot": 0, "total_nt": 0, "version": PRIMARY_VERSION}
    if not q:
        return empty
    parsed = parse_query(q)
    includes = parsed["includes"]
    excludes = parsed["excludes"]
    book_id = parsed["book_id"]
    # 至少要有一个 include 词，且整体不能过短（避免空跑）。
    if not includes:
        return empty
    if all(_too_short(t) for t in includes):
        return empty
    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))
    joined = " ".join(includes)
    has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in joined)

    ver = (version or "").strip().lower() or None
    if ver and ver in VERSIONS and _db_path(ver).exists():
        pass
    else:
        # 英文检索走 KJV 库；缺失时降级回主译本。
        ver = PRIMARY_VERSION
        if not has_cjk and _db_path("kjv").exists():
            ver = "kjv"

    where: list[str] = []
    params: list = []
    for t in includes:
        where.append("v.text LIKE ?")
        params.append(f"%{t}%")
    for t in excludes:
        where.append("v.text NOT LIKE ?")
        params.append(f"%{t}%")
    if book_id:
        where.append("v.book = ?")
        params.append(book_id)
    test = (testament or "").strip().upper()
    if test in ("OT", "NT"):
        where.append("b.testament = ?")
        params.append(test)

    where_sql = " AND ".join(where)
    base_from = "FROM verses v JOIN books b ON b.id=v.book WHERE " + where_sql

    with _connect(ver) as conn:
        total = int(conn.execute(f"SELECT COUNT(*) {base_from}", tuple(params)).fetchone()[0])
        if test in ("OT", "NT"):
            total_ot = total if test == "OT" else 0
            total_nt = total if test == "NT" else 0
        else:
            # 同条件下按约别计数，便于「全部」页提示新约还有多少
            total_ot = int(
                conn.execute(
                    f"SELECT COUNT(*) {base_from} AND b.testament = ?",
                    tuple(params) + ("OT",),
                ).fetchone()[0]
            )
            total_nt = int(
                conn.execute(
                    f"SELECT COUNT(*) {base_from} AND b.testament = ?",
                    tuple(params) + ("NT",),
                ).fetchone()[0]
            )
        rows = conn.execute(
            "SELECT v.book, b.name, v.chapter, v.verse, v.text "
            f"{base_from} "
            "ORDER BY b.sort_order, v.chapter, v.verse "
            "LIMIT ? OFFSET ?",
            tuple(params) + (lim, off),
        ).fetchall()

    return {
        "hits": [_hit_row(r, ver) for r in rows],
        "total": total,
        "total_ot": total_ot,
        "total_nt": total_nt,
        "version": ver,
    }


def _hit_row(r: sqlite3.Row, version: str = PRIMARY_VERSION) -> dict:
    book_id, name, chapter, verse, text = r[0], r[1], r[2], r[3], r[4]
    return {
        "book": book_id,
        "name": name,
        "chapter": chapter,
        "verse": verse,
        "text": text,
        "ref": f"{name} {chapter}:{verse}",
        "osis": f"{book_id}.{chapter}.{verse}",
        "version": version,
    }
