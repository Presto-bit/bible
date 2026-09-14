#!/usr/bin/env python3
"""从 CNV sections.json 抽取唯一中文标题，生成 section_titles_en.json（zh→en）。

缺网络或单条失败时保留中文作兜底值。可重复运行以增量补全。
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data/bible/cnv/sections.json"
OUT = ROOT / "data/bible/cnv/section_titles_en.json"


def translate_google(text: str, *, retries: int = 5) -> str:
    q = urllib.parse.quote(text)
    url = (
        "https://translate.googleapis.com/translate_a/single"
        f"?client=gtx&sl=zh-CN&tl=en&dt=t&q={q}"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; BeiaiSectionTitles/1.0)"},
    )
    delay = 1.0
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            parts = payload[0] if payload else []
            return "".join(p[0] for p in parts if p and p[0]).strip()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt + 1 < retries:
                time.sleep(delay)
                delay = min(delay * 2, 30.0)
                continue
            raise
    return ""


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}", file=sys.stderr)
        return 1
    data = json.loads(SRC.read_text(encoding="utf-8"))
    titles = sorted(
        {
            str(m.get("title") or "").strip()
            for marks in (data.get("chapters") or {}).values()
            for m in marks
            if str(m.get("title") or "").strip()
        }
    )
    existing: dict[str, str] = {}
    if OUT.exists():
        raw = json.loads(OUT.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            existing = {str(k): str(v) for k, v in raw.get("titles", raw).items()}

    total = len(titles)
    for i, zh in enumerate(titles, 1):
        if zh in existing and existing[zh] != zh:
            continue
        try:
            en = translate_google(zh)
            existing[zh] = en if en else zh
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, IndexError):
            existing[zh] = zh
        if i % 25 == 0 or i == total:
            OUT.write_text(
                json.dumps({"schema": "section_titles_en@1", "titles": existing}, ensure_ascii=False),
                encoding="utf-8",
            )
            print(f"{i}/{total} saved", flush=True)
        time.sleep(0.35)
    OUT.write_text(
        json.dumps({"schema": "section_titles_en@1", "titles": existing}, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"done: {len(existing)} entries -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
