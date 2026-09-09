#!/usr/bin/env python3
"""扫描 CUVS 经文模式，生成/更新 discourse_line_ranges.json。

用法:
  python scripts/catalog_discourse_lists.py          # 打印统计
  python scripts/catalog_discourse_lists.py --write  # 写入 data/bible/cnv/discourse_line_ranges.json
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from discourse_paragraphs import DISCOURSE_PATH, build_discourse_catalog, write_discourse_catalog


def main() -> None:
    parser = argparse.ArgumentParser(description="Catalog discourse list passages")
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write discourse_line_ranges.json",
    )
    args = parser.parse_args()

    catalog = build_discourse_catalog()
    entries = catalog.get("entries", [])
    kinds = Counter(e.get("kind", "?") for e in entries)
    modes = Counter(e.get("mode", "?") for e in entries)

    print(f"Entries: {len(entries)}")
    print("By kind:", dict(kinds))
    print("By mode:", dict(modes))
    print("\nSample:")
    for e in entries[:20]:
        print(f"  {e['ref']} {e['ranges']} ({e.get('kind')}, {e.get('mode')})")
    if len(entries) > 20:
        print(f"  … +{len(entries) - 20} more")

    if args.write:
        path = write_discourse_catalog()
        print(f"\nWrote {path} ({path.stat().st_size // 1024} KB)")
    else:
        print(f"\nDry run. Use --write to update {DISCOURSE_PATH}")


if __name__ == "__main__":
    main()
