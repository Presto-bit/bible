"""只读访问离线经文 SQLite（books / verses / verses_fts）。

后端用它取经文文本与卷名（构造指南检索查询、过滤注释）。连接为只读、按需打开。
"""
from __future__ import annotations

import sqlite3
from functools import lru_cache
from pathlib import Path

from ..config import get_settings


# 译本注册表：id → (展示名, 是否主译本)。主译本提供卷名/目录，其余仅供对照。
VERSIONS: dict[str, str] = {
    "cnv": "圣经新译本 (CNV)",
    "kjv": "King James Version (KJV)",
}
PRIMARY_VERSION = "cnv"


def _db_path(version: str) -> Path:
    s = get_settings()
    if version == "kjv":
        return Path(s.bible_kjv_db_path)
    return Path(s.bible_db_path)


def available_versions() -> list[dict]:
    """列出已落地（文件存在）的译本，主译本排首位。"""
    out: list[dict] = []
    for vid, label in VERSIONS.items():
        out.append(
            {
                "id": vid,
                "label": label,
                "available": _db_path(vid).exists(),
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


def get_verses(book_id: str, chapter: int, start: int, end: int | None = None) -> list[dict]:
    end = end if end is not None else start
    with _connect() as conn:
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


def search_verses(q: str, *, limit: int = 24) -> list[dict]:
    """经文检索（自动选库 + 高级语法）：
      • 含中文 → 查 CNV，LIKE 子串匹配（FTS5 默认分词器对 CJK 不友好）；
      • 纯拉丁词 → 查 KJV（若已落地），LIKE 子串匹配（支持多词 AND / 排除 / 卷书限定）。
    支持语法：引号短语、-排除词、书卷:/book: 限定卷书。
    返回结果带 version 字段，供前端标注译本。"""
    q = (q or "").strip()
    if not q:
        return []
    parsed = parse_query(q)
    includes = parsed["includes"]
    excludes = parsed["excludes"]
    book_id = parsed["book_id"]
    # 至少要有一个 include 词，且整体不能过短（避免空跑）。
    if not includes:
        return []
    if all(_too_short(t) for t in includes):
        return []
    lim = max(1, min(int(limit), 50))
    joined = " ".join(includes)
    has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in joined)
    # 英文检索走 KJV 库；缺失时降级回主译本。
    version = PRIMARY_VERSION
    if not has_cjk and _db_path("kjv").exists():
        version = "kjv"

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
    params.append(lim)

    sql = (
        "SELECT v.book, b.name, v.chapter, v.verse, v.text "
        "FROM verses v JOIN books b ON b.id=v.book "
        "WHERE " + " AND ".join(where) + " "
        "ORDER BY b.sort_order, v.chapter, v.verse "
        "LIMIT ?"
    )
    with _connect(version) as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [_hit_row(r, version) for r in rows]


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
