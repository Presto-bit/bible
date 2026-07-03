"""加载 data/ 下静态内容（带缓存），并用经库解析经文文本。"""
from __future__ import annotations

import csv
import json
import sqlite3
from functools import lru_cache
from pathlib import Path

from ..bible import reader
from ..bible.refs import parse_ref
from ..config import get_settings

# 读经计划元信息（CSV）
READING_PLANS = {
    "jhn_7": "约翰福音 · 7 天",
    "genesis_7": "创世记 · 7 天",
    "psalms_7": "诗篇入门 · 7 天",
    "gospels_7": "四福音精选 · 7 天",
    "gospels_30": "四福音 · 30 天",
    "new_testament_90": "新约 · 90 天",
    "wisdom_15": "智慧书 · 15 天",
    "prophets_21": "先知书选读 · 21 天",
    "psalms_30": "诗篇精选 · 30 天",
    "pentateuch_40": "摩西五经 · 40 天",
    "bible_year_365": "圣经通读 · 365 天",
    "mcheyne_365": "M'Cheyne · 365 天",
}
PRAYER_PLANS = {
    "prayer_morning_7": "prayer_morning_7.json",
    "prayer_gratitude_7": "prayer_gratitude_7.json",
    "prayer_acts_30": "prayer_acts_30.json",
    "prayer_psalms_14": "prayer_psalms_14.json",
    "prayer_peace_21": "prayer_peace_21.json",
}


def _data_dir() -> Path:
    return Path(get_settings().content_data_dir)


@lru_cache(maxsize=8)
def _load_json(rel: str) -> dict:
    path = _data_dir() / rel
    if not path.exists():
        raise FileNotFoundError(f"内容文件不存在：{path}")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=8)
def _load_plan_csv(plan_id: str) -> list[dict]:
    path = _data_dir() / "plans" / f"{plan_id}.csv"
    if not path.exists():
        raise FileNotFoundError(f"计划不存在：{path}")
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k in ("day", "chapter_start", "chapter_end"):
            if r.get(k):
                r[k] = int(r[k])
    return rows


def resolve_ref_text(ref: str | None, book: str | None, chapter: int | None,
                     verse_start: int | None, verse_end: int | None) -> str:
    """优先用结构化坐标，其次解析 ref 字符串，从 CNV 经库取文本。"""
    try:
        if book and chapter and verse_start:
            verses = reader.get_verses(book, chapter, verse_start, verse_end)
        elif ref:
            r = parse_ref(ref)
            if not r or r.chapter is None:
                return ""
            if r.verse_start is not None:
                verses = reader.get_verses(r.book_id, r.chapter, r.verse_start, r.verse_end)
            else:
                verses = reader.get_chapter(r.book_id, r.chapter)
        else:
            return ""
    except Exception:
        return ""
    return " ".join(v["text"] for v in verses).strip()


# ── 计划 ──
def list_plans() -> list[dict]:
    out: list[dict] = []
    for pid, title in READING_PLANS.items():
        try:
            rows = _load_plan_csv(pid)
            out.append({"plan_id": pid, "title": title, "type": "reading", "days": len(rows)})
        except FileNotFoundError:
            continue
    for pid, fname in PRAYER_PLANS.items():
        try:
            prayer = _load_json(f"plans/{fname}")
            out.append({
                "plan_id": prayer.get("plan_id", pid),
                "title": prayer.get("title", pid),
                "type": "prayer",
                "days": len(prayer.get("days", [])),
            })
        except FileNotFoundError:
            continue
    return out


def get_reading_plan(plan_id: str) -> dict | None:
    if plan_id not in READING_PLANS:
        return None
    rows = _load_plan_csv(plan_id)
    return {"plan_id": plan_id, "title": READING_PLANS[plan_id], "type": "reading", "days": rows}


def get_prayer_plan(plan_id: str) -> dict:
    fname = PRAYER_PLANS.get(plan_id)
    if not fname:
        raise FileNotFoundError(plan_id)
    return _load_json(f"plans/{fname}")


# ── 每日经文 ──
def daily_verses() -> dict:
    return _load_json("daily-verses/daily_verses.json")


# ── 交叉引用 ──
CROSSREF_TOP_N = 12


def _crossref_sqlite_path() -> Path:
    return _data_dir() / "crossrefs" / "cross_references.sqlite"


@lru_cache(maxsize=1)
def _crossref_index() -> dict[str, dict]:
    data = _load_json("crossrefs/cross_references.json")
    idx: dict[str, dict] = {}
    for item in data.get("references", []):
        idx[item["ref"]] = item
    return idx


def _crossrefs_from_sqlite(book: str, chapter: int, verse: int, limit: int) -> list[str]:
    path = _crossref_sqlite_path()
    if not path.exists():
        return []
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            "SELECT related_book, related_chapter, related_verse "
            "FROM crossrefs WHERE book=? AND chapter=? AND verse=? "
            "ORDER BY votes DESC LIMIT ?",
            (book.upper(), int(chapter), int(verse), limit),
        ).fetchall()
    finally:
        conn.close()
    return [f"{rb} {rc}:{rv}" for rb, rc, rv in rows]


def crossrefs_for(ref: str, *, limit: int = CROSSREF_TOP_N) -> dict | None:
    r = parse_ref(ref)
    if not r or r.chapter is None or r.verse_start is None:
        return None
    key = f"{r.book_id} {r.chapter}:{r.verse_start}"
    related_refs: list[str] = _crossrefs_from_sqlite(
        r.book_id, r.chapter, r.verse_start, limit
    )
    if not related_refs:
        item = _crossref_index().get(key)
        if item:
            related_refs = item.get("related", [])[:limit]
    if not related_refs:
        return None
    label = reader.book_name(r.book_id)
    label = f"{label} {r.chapter}:{r.verse_start}" if label else key
    related = [
        {"ref": rr, "text": resolve_ref_text(rr, None, None, None, None)}
        for rr in related_refs
    ]
    return {"ref": key, "label": label, "related": related, "count": len(related)}


# ── 词典 ──
def dictionary_entities() -> list[dict]:
    return _load_json("dictionary/entities.json").get("entities", [])


def dictionary_lookup(term: str | None = None, ref: str | None = None) -> list[dict]:
    items = dictionary_entities()
    if term:
        items = [
            e for e in items
            if term in e.get("name", "")
            or term in e.get("summary", "")
            or term in (e.get("disambiguation") or "")
            or any(term in a for a in e.get("aliases") or [])
        ]
    if not ref:
        return items
    from ..bible.refs import parse_ref

    r = parse_ref(ref)
    if not r:
        return items
    ctx_book = r.book_id.upper()

    def score(ent: dict) -> int:
        s = 0
        scope = {b.upper() for b in ent.get("scope_books") or []}
        if ctx_book in scope:
            s += 80
        for raw in ent.get("refs") or []:
            pr = parse_ref(raw.replace(".", " "))
            if pr and pr.book_id.upper() == ctx_book:
                s += 30
                if pr.chapter == r.chapter:
                    s += 15
        return s

    return sorted(items, key=score, reverse=True)


# ── 段落标题（CNV 源文件抽取） ──
@lru_cache(maxsize=1)
def section_titles_index() -> dict[str, list[dict]]:
    path = _data_dir() / "bible/cnv/sections.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("chapters", {})


def section_titles(book: str, chapter: int) -> list[dict]:
    key = f"{book.upper()}.{chapter}"
    return section_titles_index().get(key, [])


# ── 插画 ──
def illustrations_index() -> dict:
    return _load_json("illustrations/index.json")


def illustration_path(file_name: str) -> Path | None:
    # 防目录穿越：仅允许 index 中登记的文件
    allowed = {it["file"] for it in illustrations_index().get("items", [])}
    if file_name not in allowed:
        return None
    p = _data_dir() / "illustrations" / file_name
    return p if p.exists() else None


# ── Strong's / 原文逐词 ──
def _strongs_db_path() -> Path:
    return _data_dir() / "strongs" / "strongs.sqlite"


def strongs_for_ref(ref: str) -> dict | None:
    r = parse_ref(ref)
    if not r or r.chapter is None or r.verse_start is None:
        return None
    path = _strongs_db_path()
    if not path.exists():
        return None
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT position, word, strongs, lemma, transliteration, gloss, morphology "
            "FROM verse_words WHERE book=? AND chapter=? AND verse=? ORDER BY position",
            (r.book_id.upper(), int(r.chapter), int(r.verse_start)),
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return None
    words = [dict(row) for row in rows]
    return {
        "ref": r.display,
        "book": r.book_id,
        "chapter": r.chapter,
        "verse": r.verse_start,
        "words": words,
    }


def strongs_lookup(strongs_id: str) -> dict | None:
    sid = (strongs_id or "").strip().upper()
    if not sid:
        return None
    path = _strongs_db_path()
    if not path.exists():
        return None
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute(
            "SELECT strongs, language, lemma, transliteration, gloss "
            "FROM strongs_entries WHERE strongs=?",
            (sid,),
        ).fetchone()
    finally:
        conn.close()
    return dict(row) if row else None


# ── 主题索引 ──
@lru_cache(maxsize=1)
def topics_index() -> dict:
    path = _data_dir() / "topics" / "topics.json"
    if not path.exists():
        return {"topics": []}
    return json.loads(path.read_text(encoding="utf-8"))


def topic_by_id(topic_id: str) -> dict | None:
    for t in topics_index().get("topics", []):
        if t.get("id") == topic_id or t.get("name") == topic_id:
            return t
    return None


# ── 地理 / 时间线 ──
@lru_cache(maxsize=1)
def geography_places() -> list[dict]:
    path = _data_dir() / "geography" / "places.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("places", [])


@lru_cache(maxsize=1)
def timeline_chapters() -> list[dict]:
    path = _data_dir() / "geography" / "timeline.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("chapters", [])


def places_for_chapter(book: str, chapter: int, *, limit: int = 8) -> list[dict]:
    """本章经文出现的地点（按 places.json refs 匹配）。"""
    from ..bible.refs import parse_ref

    book = book.upper()
    ch = int(chapter)
    out: list[dict] = []
    seen: set[str] = set()
    for p in geography_places():
        pid = p.get("id") or p.get("name") or ""
        if pid in seen:
            continue
        for raw in p.get("refs") or []:
            r = parse_ref(str(raw).replace(".", " "))
            if r and r.book_id == book and r.chapter == ch:
                out.append(p)
                seen.add(pid)
                break
        if len(out) >= limit:
            break
    return out


def timeline_for(book: str, chapter: int) -> dict | None:
    book = book.upper()
    for row in timeline_chapters():
        if row.get("book") == book and row.get("chapter") == int(chapter):
            return row
    return None


def entities_at_ref(ref: str, *, limit: int = 8) -> list[dict]:
    """经节上下文相关的人名/地名（词典子集）。"""
    return dictionary_lookup(ref=ref)[:limit]


def content_attribution() -> dict:
    """公开数据集署名（CC-BY 等）。"""
    sources = [
        {
            "id": "openbible-crossrefs",
            "name": "OpenBible.info Cross References",
            "license": "CC-BY",
            "url": "https://www.openbible.info/labs/cross-references/",
        },
        {
            "id": "stepbible-strongs",
            "name": "STEPBible.org",
            "license": "CC-BY",
            "url": "https://www.stepbible.org",
        },
        {
            "id": "gnosis",
            "name": "Gnosis Biblical Knowledge Graph",
            "license": "CC-BY-SA",
            "url": "https://github.com/spearssoftware/gnosis",
        },
        {
            "id": "midvash-cuv",
            "name": "midvash/bible-data (CUVS)",
            "license": "Public Domain",
            "url": "https://github.com/midvash/bible-data",
        },
        {
            "id": "helloao-commentary",
            "name": "HelloAO Bible API (Public Domain Commentaries)",
            "license": "Public Domain",
            "url": "https://bible.helloao.org",
        },
    ]
    return {"sources": sources}
