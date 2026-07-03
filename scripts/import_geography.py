#!/usr/bin/env python3
"""圣经地理 + 章级时间线 → geography.json / timeline.json。

数据源：gnosis places + chapter-timeline (CC-BY-SA)

用法：
  python scripts/import_geography.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.usfm import parse_osis_ref

REPO = Path(__file__).resolve().parent.parent
CACHE = REPO / "data" / ".cache"
GEO_OUT = REPO / "data" / "geography" / "places.json"
TIME_OUT = REPO / "data" / "geography" / "timeline.json"

PLACES_URL = (
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/places.json"
)
TIMELINE_URL = (
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/chapter-timeline.json"
)


def _fetch(name: str, url: str) -> Path:
    dest = CACHE / name
    if not dest.exists() or dest.stat().st_size < 1000:
        print(f"  下载 {name} …")
        urllib.request.urlretrieve(url, dest)
    return dest


def main() -> int:
    places_raw = json.loads(_fetch("gnosis-places.json", PLACES_URL).read_text(encoding="utf-8"))
    timeline_raw = json.loads(
        _fetch("gnosis-timeline.json", TIMELINE_URL).read_text(encoding="utf-8")
    )

    places_list = list(places_raw.values()) if isinstance(places_raw, dict) else places_raw
    places_out = []
    for p in places_list:
        if p.get("latitude") is None or p.get("longitude") is None:
            continue
        refs = []
        for item in p.get("verses") or []:
            c = parse_osis_ref(item)
            if c:
                refs.append(c.usfm_ref)
        places_out.append({
            "id": p.get("id"),
            "name": p.get("name") or p.get("kjv_name"),
            "type": p.get("feature_type"),
            "latitude": p["latitude"],
            "longitude": p["longitude"],
            "refs": refs[:15],
        })
    places_out.sort(key=lambda x: len(x["refs"]), reverse=True)

    timeline_out = []
    for osis_key, info in (timeline_raw.items() if isinstance(timeline_raw, dict) else []):
        c = parse_osis_ref(osis_key) if "." in osis_key else None
        if not c:
            # chapter-only: 1Chr.1
            parts = osis_key.split(".")
            if len(parts) >= 2:
                from lib.usfm import osis_to_usfm_book
                book = osis_to_usfm_book(parts[0])
                if book:
                    timeline_out.append({
                        "book": book,
                        "chapter": int(parts[1]),
                        "year": info.get("year"),
                        "year_display": info.get("year_display"),
                    })
            continue
        timeline_out.append({
            "book": c.book,
            "chapter": c.chapter,
            "year": info.get("year"),
            "year_display": info.get("year_display"),
        })

    GEO_OUT.parent.mkdir(parents=True, exist_ok=True)
    GEO_OUT.write_text(
        json.dumps(
            {
                "schema": "geography@1",
                "source": "gnosis (CC-BY-SA)",
                "count": len(places_out),
                "places": places_out,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    TIME_OUT.write_text(
        json.dumps(
            {
                "schema": "timeline@1",
                "source": "gnosis chapter-timeline (CC-BY-SA)",
                "count": len(timeline_out),
                "chapters": timeline_out,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"✓ 地理：{len(places_out)} 个坐标点 → {GEO_OUT}")
    print(f"✓ 时间线：{len(timeline_out)} 章 → {TIME_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
