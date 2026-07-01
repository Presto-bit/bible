#!/usr/bin/env python3
"""生成 data/daily-verses/daily_verses.json。

精选真实经文「引用 + 主题」（约 130 条，覆盖 20 个属灵主题）。
text 字段留空（null）：正文在导入时由 CNV 经库按 book/chapter/verse 解析填充，
避免在脚本里手写译本文字造成串字。references 均为正典内真实经卷坐标。
"""
from __future__ import annotations

import csv
import json
import os

# code -> 中文全名（与 build_plans.py 对齐）
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

# (book, chapter, verse_start, verse_end, theme)
POOL: list[tuple[str, int, int, int, str]] = [
    # 盼望
    ("JER", 29, 11, 11, "盼望"), ("ROM", 15, 13, 13, "盼望"), ("LAM", 3, 22, 23, "盼望"),
    ("ROM", 8, 28, 28, "盼望"), ("HEB", 11, 1, 1, "盼望"), ("PSA", 42, 11, 11, "盼望"),
    ("ROM", 5, 5, 5, "盼望"),
    # 平安
    ("JHN", 14, 27, 27, "平安"), ("PHP", 4, 7, 7, "平安"), ("ISA", 26, 3, 3, "平安"),
    ("PSA", 4, 8, 8, "平安"), ("COL", 3, 15, 15, "平安"), ("JHN", 16, 33, 33, "平安"),
    ("2TH", 3, 16, 16, "平安"),
    # 信靠
    ("PRO", 3, 5, 6, "信靠"), ("PSA", 56, 3, 3, "信靠"), ("ISA", 41, 10, 10, "信靠"),
    ("PSA", 37, 5, 5, "信靠"), ("NAM", 1, 7, 7, "信靠"), ("PSA", 9, 10, 10, "信靠"),
    ("PSA", 125, 1, 1, "信靠"),
    # 力量
    ("PHP", 4, 13, 13, "力量"), ("ISA", 40, 31, 31, "力量"), ("PSA", 46, 1, 1, "力量"),
    ("EPH", 6, 10, 10, "力量"), ("2CO", 12, 9, 9, "力量"), ("PSA", 28, 7, 7, "力量"),
    ("NEH", 8, 10, 10, "力量"), ("HAB", 3, 19, 19, "力量"),
    # 爱
    ("JHN", 3, 16, 16, "爱"), ("ROM", 8, 38, 39, "爱"), ("1CO", 13, 4, 7, "爱"),
    ("1JN", 4, 19, 19, "爱"), ("JHN", 13, 34, 34, "爱"), ("ROM", 5, 8, 8, "爱"),
    ("JER", 31, 3, 3, "爱"), ("1JN", 4, 7, 7, "爱"),
    # 喜乐
    ("PSA", 16, 11, 11, "喜乐"), ("PHP", 4, 4, 4, "喜乐"), ("PSA", 118, 24, 24, "喜乐"),
    ("GAL", 5, 22, 23, "喜乐"), ("JHN", 15, 11, 11, "喜乐"), ("PSA", 30, 5, 5, "喜乐"),
    # 智慧
    ("JAS", 1, 5, 5, "智慧"), ("PRO", 9, 10, 10, "智慧"), ("PRO", 2, 6, 6, "智慧"),
    ("COL", 2, 3, 3, "智慧"), ("PSA", 111, 10, 10, "智慧"), ("JAS", 3, 17, 17, "智慧"),
    # 引导
    ("PSA", 32, 8, 8, "引导"), ("ISA", 30, 21, 21, "引导"), ("PSA", 119, 105, 105, "引导"),
    ("PSA", 23, 3, 3, "引导"), ("JHN", 16, 13, 13, "引导"), ("PSA", 48, 14, 14, "引导"),
    # 安慰
    ("MAT", 5, 4, 4, "安慰"), ("2CO", 1, 3, 4, "安慰"), ("PSA", 34, 18, 18, "安慰"),
    ("MAT", 11, 28, 28, "安慰"), ("PSA", 147, 3, 3, "安慰"), ("REV", 21, 4, 4, "安慰"),
    # 赦免
    ("1JN", 1, 9, 9, "赦免"), ("EPH", 1, 7, 7, "赦免"), ("PSA", 103, 12, 12, "赦免"),
    ("MIC", 7, 19, 19, "赦免"), ("COL", 1, 14, 14, "赦免"), ("ACT", 3, 19, 19, "赦免"),
    # 感恩
    ("1TH", 5, 18, 18, "感恩"), ("PSA", 107, 1, 1, "感恩"), ("COL", 3, 17, 17, "感恩"),
    ("PSA", 100, 4, 4, "感恩"), ("EPH", 5, 20, 20, "感恩"), ("PSA", 136, 1, 1, "感恩"),
    # 谦卑
    ("JAS", 4, 6, 6, "谦卑"), ("PHP", 2, 3, 3, "谦卑"), ("1PE", 5, 6, 6, "谦卑"),
    ("PRO", 11, 2, 2, "谦卑"), ("MIC", 6, 8, 8, "谦卑"), ("MAT", 23, 12, 12, "谦卑"),
    # 勇气
    ("JOS", 1, 9, 9, "勇气"), ("DEU", 31, 6, 6, "勇气"), ("PSA", 27, 1, 1, "勇气"),
    ("1CO", 16, 13, 13, "勇气"), ("2TI", 1, 7, 7, "勇气"), ("PSA", 31, 24, 24, "勇气"),
    # 应许
    ("MAT", 28, 20, 20, "应许"), ("HEB", 13, 5, 5, "应许"), ("ISA", 43, 2, 2, "应许"),
    ("2CO", 1, 20, 20, "应许"), ("PSA", 37, 4, 4, "应许"), ("ROM", 8, 31, 31, "应许"),
    # 祷告
    ("PHP", 4, 6, 6, "祷告"), ("1TH", 5, 17, 17, "祷告"), ("MAT", 7, 7, 7, "祷告"),
    ("JAS", 5, 16, 16, "祷告"), ("MRK", 11, 24, 24, "祷告"), ("MAT", 6, 6, 6, "祷告"),
    ("COL", 4, 2, 2, "祷告"),
    # 敬拜
    ("PSA", 95, 6, 6, "敬拜"), ("PSA", 100, 2, 2, "敬拜"), ("JHN", 4, 24, 24, "敬拜"),
    ("PSA", 29, 2, 2, "敬拜"), ("ROM", 12, 1, 1, "敬拜"),
    # 永生
    ("JHN", 11, 25, 25, "永生"), ("JHN", 17, 3, 3, "永生"), ("ROM", 6, 23, 23, "永生"),
    ("1JN", 5, 13, 13, "永生"), ("JHN", 10, 28, 28, "永生"),
    # 顺服
    ("ROM", 12, 2, 2, "顺服"), ("1SA", 15, 22, 22, "顺服"), ("JHN", 14, 15, 15, "顺服"),
    ("JAS", 1, 22, 22, "顺服"), ("PRO", 16, 3, 3, "顺服"),
    # 忍耐
    ("JAS", 1, 2, 4, "忍耐"), ("ROM", 5, 3, 4, "忍耐"), ("GAL", 6, 9, 9, "忍耐"),
    ("HEB", 12, 1, 1, "忍耐"), ("ROM", 12, 12, 12, "忍耐"), ("JAS", 5, 7, 8, "忍耐"),
    # 恩典
    ("EPH", 2, 8, 9, "恩典"), ("TIT", 2, 11, 11, "恩典"), ("HEB", 4, 16, 16, "恩典"),
    ("ROM", 3, 24, 24, "恩典"), ("2CO", 9, 8, 8, "恩典"),
]


def ref_label(book: str, ch: int, vs: int, ve: int) -> str:
    v = f"{vs}" if vs == ve else f"{vs}-{ve}"
    return f"{NAME[book]} {ch}:{v}"


def main() -> None:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(here, "data", "daily-verses")
    os.makedirs(out_dir, exist_ok=True)

    # 去重校验
    seen = set()
    items = []
    for day, (book, ch, vs, ve, theme) in enumerate(POOL, start=1):
        key = (book, ch, vs, ve)
        assert key not in seen, f"重复经文：{ref_label(book, ch, vs, ve)}"
        seen.add(key)
        items.append({
            "day": day,
            "ref": ref_label(book, ch, vs, ve),
            "book": book,
            "chapter": ch,
            "verse_start": vs,
            "verse_end": ve,
            "theme": theme,
            "text": None,  # 由 CNV 经库导入时填充
        })

    payload = {
        "schema": "daily_verses@1",
        "note": "text=null 表示由 CNV 经库按 book/chapter/verse_* 解析填充；references 为正典真实坐标。",
        "count": len(items),
        "themes": sorted({i["theme"] for i in items}),
        "verses": items,
    }

    out = os.path.join(out_dir, "daily_verses.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    by_theme: dict[str, int] = {}
    for i in items:
        by_theme[i["theme"]] = by_theme.get(i["theme"], 0) + 1
    print(f"daily_verses.json: {len(items)} 条 / {len(by_theme)} 主题")
    print("主题分布:", ", ".join(f"{k}{v}" for k, v in by_theme.items()))


if __name__ == "__main__":
    main()
