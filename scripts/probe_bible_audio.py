#!/usr/bin/env python3
"""探测外部有声圣经源：能否按章获取 MP3 并镜像到 data/bible_audio/。

不做产品接口；仅供验证数据可得性与版本对应关系。

用法：
  python scripts/probe_bible_audio.py --book JHN --chapter 3
  python scripts/probe_bible_audio.py --book JHN --chapter 3 --download
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from epub_to_verses import BOOK_ORDER  # noqa: E402

FHL_AU = "https://bkbible.fhl.net/api/au.php"

# FHL au.php version 参数 → 与彼爱译本的大致对应（章级 MP3，非逐节）
FHL_VERSIONS = {
    "cuvs": 0,   # 和合本 unv1 — 与 cuvs 文本最接近
    "tcv": 4,    # 现代中文译本（非 cnv）
    "spring_cuv": 11,
}


def fhl_bid(book_id: str) -> int:
    bid = BOOK_ORDER.get(book_id.upper())
    if bid is None:
        raise SystemExit(f"未知书卷: {book_id}")
    return bid


def fetch_fhl_chapter(version: int, book_id: str, chapter: int) -> dict:
    bid = fhl_bid(book_id)
    url = f"{FHL_AU}?version={version}&bid={bid}&chap={chapter}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    if data.get("status") != "success":
        raise SystemExit(f"FHL 失败: {data}")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe Bible chapter audio sources")
    parser.add_argument("--book", default="JHN")
    parser.add_argument("--chapter", type=int, default=3)
    parser.add_argument("--version", default="cuvs", choices=sorted(FHL_VERSIONS))
    parser.add_argument(
        "--download",
        action="store_true",
        help="镜像 MP3 到 data/bible_audio/{version}/{book}/{chapter}.mp3",
    )
    args = parser.parse_args()

    fhl_v = FHL_VERSIONS[args.version]
    meta = fetch_fhl_chapter(fhl_v, args.book, args.chapter)
    out = {
        "app_version": args.version,
        "book": args.book.upper(),
        "chapter": args.chapter,
        "fhl_version": fhl_v,
        "fhl_name": meta.get("name"),
        "mp3_url": meta.get("mp3"),
        "ogg_url": meta.get("ogg"),
        "granularity": "chapter",
        "bid": fhl_bid(args.book),
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))

    if args.download and meta.get("mp3"):
        dest = ROOT / "data" / "bible_audio" / args.version / args.book.upper()
        dest.mkdir(parents=True, exist_ok=True)
        target = dest / f"{args.chapter}.mp3"
        urllib.request.urlretrieve(meta["mp3"], target)
        out["local_path"] = str(target.relative_to(ROOT))
        out["bytes"] = target.stat().st_size
        print(f"\nSaved {target} ({out['bytes']} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
