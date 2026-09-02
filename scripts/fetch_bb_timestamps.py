#!/usr/bin/env python3
"""拉取 Bible Brain 节级 timestamps 并写入 data/bible_audio 缓存。

需环境变量 BIBLE_BRAIN_API_KEY。用法：

  python scripts/fetch_bb_timestamps.py --book JHN --chapter 3
  python scripts/fetch_bb_timestamps.py --book JHN --chapter 3 --audio-version cuvs
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.bible import audio  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch BB verse timestamps for a chapter")
    parser.add_argument("--book", default="JHN")
    parser.add_argument("--chapter", type=int, default=3)
    parser.add_argument("--audio-version", default="cuvs")
    args = parser.parse_args()

    if not (os.environ.get("BIBLE_BRAIN_API_KEY") or "").strip():
        raise SystemExit("请设置 BIBLE_BRAIN_API_KEY")

    body = audio.get_timestamps(args.audio_version, args.book, args.chapter)
    cache = audio._timestamps_path(args.audio_version, args.book.upper(), args.chapter)  # noqa: SLF001
    print(json.dumps(body, ensure_ascii=False, indent=2))
    print(f"\n缓存: {cache}", file=sys.stderr)
    print(f"节数: {len(body.get('verses') or [])}", file=sys.stderr)


if __name__ == "__main__":
    main()
