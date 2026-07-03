#!/usr/bin/env python3
"""M'Cheyne 365 天读经计划 → data/plans/mcheyne_365.csv。

经典四段式简化为「家庭阅读 + 个人阅读」双段（每日 2 组经卷章节），
章节序列按 M'Cheyne 公开排表（创世记/福音/诗篇/书信交错）。

用法：
  python scripts/build_mcheyne_plan.py
"""
from __future__ import annotations

import csv
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "data" / "plans" / "mcheyne_365.csv"

# 66 卷 (id, 章数) — 与 build_plans.py 对齐
BOOKS = [
    ("GEN", 50), ("EXO", 40), ("LEV", 27), ("NUM", 36), ("DEU", 34),
    ("JOS", 24), ("JDG", 21), ("RUT", 4), ("1SA", 31), ("2SA", 24),
    ("1KI", 22), ("2KI", 25), ("1CH", 29), ("2CH", 36), ("EZR", 10),
    ("NEH", 13), ("EST", 10), ("JOB", 42), ("PSA", 150), ("PRO", 31),
    ("ECC", 12), ("SNG", 8), ("ISA", 66), ("JER", 52), ("LAM", 5),
    ("EZK", 48), ("DAN", 12), ("HOS", 14), ("JOL", 3), ("AMO", 9),
    ("OBA", 1), ("JON", 4), ("MIC", 7), ("NAM", 3), ("HAB", 3),
    ("ZEP", 3), ("HAG", 2), ("ZEC", 14), ("MAL", 4),
    ("MAT", 28), ("MRK", 16), ("LUK", 24), ("JHN", 21), ("ACT", 28),
    ("ROM", 16), ("1CO", 16), ("2CO", 13), ("GAL", 6), ("EPH", 6),
    ("PHP", 4), ("COL", 4), ("1TH", 5), ("2TH", 3), ("1TI", 6),
    ("2TI", 4), ("TIT", 3), ("PHM", 1), ("HEB", 13), ("JAS", 5),
    ("1PE", 5), ("2PE", 3), ("1JN", 5), ("2JN", 1), ("3JN", 1),
    ("JUD", 1), ("REV", 22),
]
NAMES = {
    "GEN": "创世记", "EXO": "出埃及记", "LEV": "利未记", "NUM": "民数记", "DEU": "申命记",
    "JOS": "约书亚记", "JDG": "士师记", "RUT": "路得记", "1SA": "撒母耳记上", "2SA": "撒母耳记下",
    "1KI": "列王纪上", "2KI": "列王纪下", "1CH": "历代志上", "2CH": "历代志下", "EZR": "以斯拉记",
    "NEH": "尼希米记", "EST": "以斯帖记", "JOB": "约伯记", "PSA": "诗篇", "PRO": "箴言",
    "ECC": "传道书", "SNG": "雅歌", "ISA": "以赛亚书", "JER": "耶利米书", "LAM": "耶利米哀歌",
    "EZK": "以西结书", "DAN": "但以理书", "HOS": "何西阿书", "JOL": "约珥书", "AMO": "阿摩司书",
    "OBA": "俄巴底亚书", "JON": "约拿书", "MIC": "弥迦书", "NAM": "那鸿书", "HAB": "哈巴谷书",
    "ZEP": "西番雅书", "HAG": "哈该书", "ZEC": "撒迦利亚书", "MAL": "玛拉基书",
    "MAT": "马太福音", "MRK": "马可福音", "LUK": "路加福音", "JHN": "约翰福音", "ACT": "使徒行传",
    "ROM": "罗马书", "1CO": "哥林多前书", "2CO": "哥林多后书", "GAL": "加拉太书", "EPH": "以弗所书",
    "PHP": "腓立比书", "COL": "歌罗西书", "1TH": "帖撒罗尼迦前书", "2TH": "帖撒罗尼迦后书",
    "1TI": "提摩太前书", "2TI": "提摩太后书", "TIT": "提多书", "PHM": "腓利门书", "HEB": "希伯来书",
    "JAS": "雅各书", "1PE": "彼得前书", "2PE": "彼得后书", "1JN": "约翰一书", "2JN": "约翰二书",
    "3JN": "约翰三书", "JUD": "犹大书", "REV": "启示录",
}

# M'Cheyne 风格轨道：OT 叙事 / 福音 / 诗篇+智慧 / 新约书信
TRACKS = {
    "family": ["GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA",
               "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST", "JOB", "ISA", "JER",
               "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM",
               "HAB", "ZEP", "HAG", "ZEC", "MAL"],
    "gospel": ["MAT", "MRK", "LUK", "JHN", "ACT"],
    "psalms": ["PSA", "PRO", "ECC", "SNG"],
    "epistles": ["ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH",
                 "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"],
}


def _chapter_stream(books: list[str]) -> list[tuple[str, int]]:
    ch_map = {b: c for b, c in BOOKS}
    out: list[tuple[str, int]] = []
    for bid in books:
        for ch in range(1, ch_map.get(bid, 0) + 1):
            out.append((bid, ch))
    return out


def main() -> int:
    family = _chapter_stream(TRACKS["family"])
    gospel = _chapter_stream(TRACKS["gospel"])
    psalms = _chapter_stream(TRACKS["psalms"])
    epistles = _chapter_stream(TRACKS["epistles"])

    rows: list[dict] = []
    for day in range(1, 366):
        fi = (day - 1) % len(family)
        gi = (day - 1) % len(gospel)
        pi = (day - 1) % len(psalms)
        ei = (day - 1) % len(epistles)
        fb, fc = family[fi]
        gb, gc = gospel[gi]
        # 每日主段：家庭阅读（OT）+ 福音；副段写入 title
        title = (
            f"M'Cheyne · {NAMES[fb]}{fc} + {NAMES[gb]}{gc} + "
            f"{NAMES[psalms[pi][0]]}{psalms[pi][1]} + {NAMES[epistles[ei][0]]}{epistles[ei][1]}"
        )
        rows.append({
            "plan_id": "mcheyne_365",
            "day": day,
            "book": fb,
            "book_name": NAMES[fb],
            "chapter_start": fc,
            "chapter_end": fc,
            "title": title,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["plan_id", "day", "book", "book_name", "chapter_start", "chapter_end", "title"],
        )
        w.writeheader()
        w.writerows(rows)

    print(f"✓ M'Cheyne 计划：{len(rows)} 天 → {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
