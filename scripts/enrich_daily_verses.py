#!/usr/bin/env python3
"""扩充 daily_verses.json 至 365 条（主题池 + 经库坐标）。

用法：
  python scripts/enrich_daily_verses.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DAILY = REPO / "data" / "daily-verses" / "daily_verses.json"
TOPICS = REPO / "data" / "topics" / "topics.json"
NAME = {
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


def _parse_ref(ref: str) -> dict | None:
    parts = ref.strip().split()
    if len(parts) < 2:
        return None
    book = parts[0]
    ch, vs = parts[1].split(":")
    return {
        "book": book,
        "chapter": int(ch),
        "verse_start": int(vs),
        "verse_end": int(vs),
        "ref": f"{NAME.get(book, book)} {ch}:{vs}",
    }


def main() -> int:
    existing = json.loads(DAILY.read_text(encoding="utf-8")) if DAILY.exists() else {
        "schema": "daily_verses@1", "verses": [], "themes": []
    }
    verses = list(existing.get("verses") or [])
    themes = set(existing.get("themes") or [])

    pool: list[tuple[str, str]] = []
    if TOPICS.exists():
        tdata = json.loads(TOPICS.read_text(encoding="utf-8"))
        for t in tdata.get("topics") or []:
            theme = t.get("name") or t.get("id")
            for ref in t.get("refs") or []:
                pool.append((theme, ref))

    seen = {
        (v.get("book"), v.get("chapter"), v.get("verse_start"))
        for v in verses
    }
    for theme, ref in pool:
        parsed = _parse_ref(ref)
        if not parsed:
            continue
        key = (parsed["book"], parsed["chapter"], parsed["verse_start"])
        if key in seen:
            continue
        seen.add(key)
        verses.append({
            "day": len(verses) + 1,
            "theme": theme,
            "text": None,
            **parsed,
        })
        themes.add(theme)

    # 循环填充至 365（避免死循环：最多尝试 pool 长度 × 3 次）
    idx = 0
    attempts = 0
    max_attempts = max(len(pool) * 3, 1)
    while len(verses) < 365 and pool and attempts < max_attempts:
        theme, ref = pool[idx % len(pool)]
        parsed = _parse_ref(ref)
        idx += 1
        attempts += 1
        if not parsed:
            continue
        key = (parsed["book"], parsed["chapter"], parsed["verse_start"])
        if key in seen:
            continue
        seen.add(key)
        verses.append({
            "day": len(verses) + 1,
            "theme": theme,
            "text": None,
            **parsed,
        })

    for i, v in enumerate(verses[:365], start=1):
        v["day"] = i

    out = {
        "schema": "daily_verses@2",
        "source": "build_daily_verses + topics enrich",
        "count": min(365, len(verses)),
        "themes": sorted(themes),
        "verses": verses[:365],
    }
    DAILY.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ 每日经文：{out['count']} 条 / {len(out['themes'])} 主题 → {DAILY}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
