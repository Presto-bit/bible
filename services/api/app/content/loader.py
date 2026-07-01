"""加载 data/ 下静态内容（带缓存），并用经库解析经文文本。"""
from __future__ import annotations

import csv
import json
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
@lru_cache(maxsize=1)
def _crossref_index() -> dict[str, dict]:
    data = _load_json("crossrefs/cross_references.json")
    idx: dict[str, dict] = {}
    for item in data.get("references", []):
        idx[item["ref"]] = item
    return idx


def crossrefs_for(ref: str) -> dict | None:
    r = parse_ref(ref)
    if not r:
        return None
    # 数据键为 "JHN 3:16" 形式
    key = f"{r.book_id} {r.chapter}:{r.verse_start}" if r.verse_start else None
    item = _crossref_index().get(key) if key else None
    if not item:
        return None
    related = []
    for rr in item.get("related", []):
        related.append({"ref": rr, "text": resolve_ref_text(rr, None, None, None, None)})
    return {"ref": item["ref"], "label": item.get("label"), "related": related}


# ── 词典 ──
def dictionary_entities() -> list[dict]:
    return _load_json("dictionary/entities.json").get("entities", [])


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
