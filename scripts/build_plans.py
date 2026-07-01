#!/usr/bin/env python3
"""生成读经计划 CSV（按规范章数均分到天）。

输出到 data/plans/：
  - gospels_30.csv       四福音 · 30 天
  - new_testament_90.csv 新约 · 90 天
  - bible_year_365.csv   一年读完全本圣经 · 365 天

CSV 列：plan_id,day,book,book_name,chapter_start,chapter_end,title
（章级计划：每天若跨书卷则拆成多行；verse 省略，整章阅读）
"""
from __future__ import annotations

import csv
import os

# (code, 中文名, 章数) —— 新教 66 卷正典
BOOKS: list[tuple[str, str, int]] = [
    ("GEN", "创世记", 50), ("EXO", "出埃及记", 40), ("LEV", "利未记", 27),
    ("NUM", "民数记", 36), ("DEU", "申命记", 34), ("JOS", "约书亚记", 24),
    ("JDG", "士师记", 21), ("RUT", "路得记", 4), ("1SA", "撒母耳记上", 31),
    ("2SA", "撒母耳记下", 24), ("1KI", "列王纪上", 22), ("2KI", "列王纪下", 25),
    ("1CH", "历代志上", 29), ("2CH", "历代志下", 36), ("EZR", "以斯拉记", 10),
    ("NEH", "尼希米记", 13), ("EST", "以斯帖记", 10), ("JOB", "约伯记", 42),
    ("PSA", "诗篇", 150), ("PRO", "箴言", 31), ("ECC", "传道书", 12),
    ("SNG", "雅歌", 8), ("ISA", "以赛亚书", 66), ("JER", "耶利米书", 52),
    ("LAM", "耶利米哀歌", 5), ("EZK", "以西结书", 48), ("DAN", "但以理书", 12),
    ("HOS", "何西阿书", 14), ("JOL", "约珥书", 3), ("AMO", "阿摩司书", 9),
    ("OBA", "俄巴底亚书", 1), ("JON", "约拿书", 4), ("MIC", "弥迦书", 7),
    ("NAM", "那鸿书", 3), ("HAB", "哈巴谷书", 3), ("ZEP", "西番雅书", 3),
    ("HAG", "哈该书", 2), ("ZEC", "撒迦利亚书", 14), ("MAL", "玛拉基书", 4),
    ("MAT", "马太福音", 28), ("MRK", "马可福音", 16), ("LUK", "路加福音", 24),
    ("JHN", "约翰福音", 21), ("ACT", "使徒行传", 28), ("ROM", "罗马书", 16),
    ("1CO", "哥林多前书", 16), ("2CO", "哥林多后书", 13), ("GAL", "加拉太书", 6),
    ("EPH", "以弗所书", 6), ("PHP", "腓立比书", 4), ("COL", "歌罗西书", 4),
    ("1TH", "帖撒罗尼迦前书", 5), ("2TH", "帖撒罗尼迦后书", 3), ("1TI", "提摩太前书", 6),
    ("2TI", "提摩太后书", 4), ("TIT", "提多书", 3), ("PHM", "腓利门书", 1),
    ("HEB", "希伯来书", 13), ("JAS", "雅各书", 5), ("1PE", "彼得前书", 5),
    ("2PE", "彼得后书", 3), ("1JN", "约翰一书", 5), ("2JN", "约翰二书", 1),
    ("3JN", "约翰三书", 1), ("JUD", "犹大书", 1), ("REV", "启示录", 22),
]

NAME = {code: name for code, name, _ in BOOKS}


def units(book_codes: list[str]) -> list[tuple[str, int]]:
    """展开为按顺序的 (book, chapter) 单元列表。"""
    out: list[tuple[str, int]] = []
    chap = {code: n for code, _, n in BOOKS}
    for code in book_codes:
        for c in range(1, chap[code] + 1):
            out.append((code, c))
    return out


def build_plan(plan_id: str, book_codes: list[str], days: int) -> list[dict]:
    seq = units(book_codes)
    total = len(seq)
    base, extra = divmod(total, days)  # 前 extra 天多读 1 章
    rows: list[dict] = []
    idx = 0
    for day in range(1, days + 1):
        take = base + (1 if day <= extra else 0)
        day_units = seq[idx:idx + take]
        idx += take
        # 按书卷分组成连续区段
        i = 0
        while i < len(day_units):
            book = day_units[i][0]
            cs = day_units[i][1]
            ce = cs
            j = i + 1
            while j < len(day_units) and day_units[j][0] == book:
                ce = day_units[j][1]
                j += 1
            title = f"{NAME[book]} {cs}" if cs == ce else f"{NAME[book]} {cs}-{ce}"
            rows.append({
                "plan_id": plan_id, "day": day, "book": book,
                "book_name": NAME[book], "chapter_start": cs,
                "chapter_end": ce, "title": title,
            })
            i = j
    assert idx == total, f"{plan_id}: 漏章 {idx}/{total}"
    return rows


def write_csv(path: str, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cols = ["plan_id", "day", "book", "book_name", "chapter_start", "chapter_end", "title"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def main() -> None:
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, "data", "plans")

    nt = ["MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH",
          "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS",
          "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV"]
    gospels = ["MAT", "MRK", "LUK", "JHN"]
    whole = [c for c, _, _ in BOOKS]

    plans = [
        ("gospels_30", gospels, 30, "gospels_30.csv"),
        ("new_testament_90", nt, 90, "new_testament_90.csv"),
        ("bible_year_365", whole, 365, "bible_year_365.csv"),
    ]
    for plan_id, codes, days, fname in plans:
        rows = build_plan(plan_id, codes, days)
        write_csv(os.path.join(out, fname), rows)
        chapters = sum(n for c, _, n in BOOKS if c in codes)
        print(f"{fname}: {days} 天 / {chapters} 章 / {len(rows)} 行")


if __name__ == "__main__":
    main()
