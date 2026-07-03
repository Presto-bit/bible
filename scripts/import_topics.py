#!/usr/bin/env python3
"""人生/查经主题索引 → topics.json。

从每日经文主题 + 精选主题经节池生成，供发现页与搜索。

用法：
  python scripts/import_topics.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DAILY = REPO / "data" / "daily-verses" / "daily_verses.json"
OUT = REPO / "data" / "topics" / "topics.json"

# 主题 → 代表经节（USFM 坐标）
CURATED: dict[str, list[str]] = {
    "信靠": ["PRO 3:5", "PSA 37:5", "ISA 26:3", "JER 17:7", "HEB 11:1"],
    "盼望": ["JER 29:11", "ROM 8:28", "ROM 15:13", "HEB 11:1", "1PE 1:3"],
    "平安": ["JHN 14:27", "PHP 4:7", "ISA 26:3", "COL 3:15", "PSA 4:8"],
    "力量": ["ISA 40:31", "PHP 4:13", "EPH 3:16", "2CO 12:9", "NEH 8:10"],
    "爱": ["1CO 13:4", "JHN 3:16", "ROM 5:8", "1JN 4:8", "COL 3:14"],
    "祷告": ["1TH 5:17", "MAT 6:6", "PHP 4:6", "JAS 5:16", "LUK 18:1"],
    "感恩": ["1TH 5:18", "PSA 107:1", "EPH 5:20", "PHP 4:6", "COL 3:17"],
    "智慧": ["PRO 3:5", "JAS 1:5", "PRO 9:10", "ECC 12:13", "COL 2:3"],
    "救恩": ["EPH 2:8", "ROM 3:23", "ROM 6:23", "ACT 4:12", "TIT 3:5"],
    "圣灵": ["GAL 5:22", "JHN 14:26", "ROM 8:26", "ACT 1:8", "1CO 12:7"],
    "教会": ["ACT 2:42", "HEB 10:25", "1CO 12:12", "EPH 4:11", "1PE 2:9"],
    "苦难": ["ROM 5:3", "JAS 1:2", "2CO 4:17", "1PE 4:12", "PSA 23:4"],
    "焦虑": ["MAT 6:25", "1PE 5:7", "PHP 4:6", "PSA 55:22", "ISA 41:10"],
    "宽恕": ["MAT 6:14", "EPH 4:32", "COL 3:13", "LUK 23:34", "MIC 7:19"],
    "公义": ["ROM 3:22", "MAT 5:6", "MIC 6:8", "ISA 61:10", "2CO 5:21"],
    "创造": ["GEN 1:1", "COL 1:16", "PSA 19:1", "JHN 1:3", "HEB 11:3"],
    "复活": ["1CO 15:20", "JHN 11:25", "ROM 6:4", "ACT 2:24", "1TH 4:16"],
    "使命": ["MAT 28:19", "ACT 1:8", "MRK 16:15", "2CO 5:20", "ROM 10:14"],
    "家庭": ["EPH 6:4", "PRO 22:6", "COL 3:21", "PSA 127:3", "DEU 6:7"],
    "工作": ["COL 3:23", "PRO 16:3", "ECC 9:10", "1CO 10:31", "2TH 3:10"],
}


def main() -> int:
    themes: set[str] = set(CURATED)
    if DAILY.exists():
        data = json.loads(DAILY.read_text(encoding="utf-8"))
        themes.update(data.get("themes") or [])
        for v in data.get("verses") or []:
            t = (v.get("theme") or "").strip()
            if not t:
                continue
            themes.add(t)
            ref = v.get("book")
            if ref and v.get("chapter") and v.get("verse_start"):
                coord = f"{ref} {v['chapter']}:{v['verse_start']}"
                CURATED.setdefault(t, [])
                if coord not in CURATED[t]:
                    CURATED[t].append(coord)

    topics = []
    for name in sorted(themes):
        refs = CURATED.get(name, [])
        topics.append({
            "id": name,
            "name": name,
            "refs": refs[:12],
            "verse_count": len(refs),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "schema": "topics@1",
                "source": "curated + daily_verses",
                "count": len(topics),
                "topics": topics,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"✓ 主题索引：{len(topics)} 个 → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
