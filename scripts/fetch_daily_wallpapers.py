#!/usr/bin/env python3
"""下载每日经文风景壁纸到 apps/web/public/daily-wallpapers/。

用法：
  python scripts/fetch_daily_wallpapers.py          # 仅下载缺失文件
  python scripts/fetch_daily_wallpapers.py --force  # 全部重下
"""
from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "apps" / "web" / "public" / "daily-wallpapers"

# Unsplash 风景图（photo-{timestamp}-{hash}，已验证可下载）
PHOTOS = [
    "1506905925346-21bda4d32df4",
    "1469474968028-56623f02e42e",
    "1441974231531-c6227db76b6e",
    "1470071459604-3b5ec3a7fe05",
    "1501785888041-af3ef285b470",
    "1519681393784-d120267933ba",
    "1472214103451-9374bd1c798e",
    "1433086966358-54859d0ed716",
    "1500530855697-b586d89ba3ee",
    "1464822759023-fed622ff2c3b",
    "1475924156734-496f6cac6ec1",
    "1418065460487-3e41a6c84dc5",
    "1752035682760-44a15d08e50a",
    "1767615057404-84275d306abd",
    "1775334006478-865fa1b777de",
    "1764377848437-27fd0138db4a",
    "1772477649152-340fbd0d33f5",
    "1740149263431-098cc6705df4",
    "1755096880218-6eaedd4c07da",
    "1684962756735-bb70f883ddc5",
    "1764590386270-3914d8232405",
    "1763568300048-d5e948eab1e9",
    "1465146344425-f00d5f5c8f07",
    "1476514525535-07fb3b4ae5f1",
    "1507525428034-b723cf961d3e",
    "1615729947596-a598e5de0ab3",
    "1528715471579-d1bcf0ba5e83",
    "1469854523086-cc02fe5d8800",
    "1483728642387-6c3bdd6c93e5",
    "1606041008023-472dfb5e530f",
    "1472289065668-ce650ac443d2",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="覆盖已存在文件")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    ok, skip, fail = 0, 0, 0

    for i, photo_id in enumerate(PHOTOS, start=1):
        dest = OUT / f"scenery-{i:02d}.jpg"
        if dest.exists() and not args.force:
            skip += 1
            continue
        url = f"https://images.unsplash.com/photo-{photo_id}?auto=format&fit=crop&w=1600&q=85"
        print(f"→ {dest.name}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "BibleApp/1.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
            if len(data) < 10_000:
                print(f"  ⚠ 文件过小，跳过 ({len(data)} bytes)")
                fail += 1
                continue
            dest.write_bytes(data)
            ok += 1
        except Exception as e:
            print(f"  ✗ {e}")
            fail += 1

    print(f"\n完成：下载 {ok}，跳过 {skip}，失败 {fail}（共 {len(PHOTOS)} 张）")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
