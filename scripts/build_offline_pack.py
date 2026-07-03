#!/usr/bin/env python3
"""打离线包：经文 SQLite + 静态内容 → 可供 Flutter assets / 下载分发的 zip。

产物：build/offline_pack/bible_offline_<version>.zip + manifest.json（含 sha256）。
内容：
  bible/bible_cnv.sqlite        主译本经库（books+verses+FTS5）
  content/plans/*.csv|json       读经/祷告计划
  content/daily-verses/*.json    每日经文
  content/crossrefs/*.json       交叉引用
  content/dictionary/*.json      词典
  content/illustrations/*.svg    主题插画 + index.json

用法：
  python scripts/build_offline_pack.py [--version 2026.06] [--translation cnv]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _add(zf: zipfile.ZipFile, src: Path, arc: str, manifest: list[dict]) -> None:
    zf.write(src, arc)
    manifest.append({"path": arc, "bytes": src.stat().st_size, "sha256": _sha256(src)})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=date.today().strftime("%Y.%m.%d"))
    ap.add_argument("--translation", default="cnv")
    ap.add_argument("--out-dir", type=Path, default=REPO / "build" / "offline_pack")
    args = ap.parse_args()

    sqlite_path = REPO / "build" / f"bible_{args.translation}.sqlite"
    if not sqlite_path.exists():
        raise SystemExit(f"缺少经库：{sqlite_path}（先跑 import_bible.py）")

    cuvs_path = REPO / "build" / "bible_cuvs.sqlite"
    kjv_path = REPO / "build" / "bible_kjv.sqlite"

    args.out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = args.out_dir / f"bible_offline_{args.version}.zip"
    manifest: list[dict] = []

    content_globs = [
        ("plans", "*.csv"),
        ("plans", "*.json"),
        ("daily-verses", "*.json"),
        ("crossrefs", "*.json"),
        ("crossrefs", "*.sqlite"),
        ("dictionary", "*.json"),
        ("topics", "*.json"),
        ("geography", "*.json"),
        ("summaries", "*.json"),
        ("strongs", "*.sqlite"),
        ("illustrations", "*.json"),
        ("illustrations", "*.svg"),
    ]

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        _add(zf, sqlite_path, f"bible/bible_{args.translation}.sqlite", manifest)
        if cuvs_path.exists():
            _add(zf, cuvs_path, "bible/bible_cuvs.sqlite", manifest)
        if kjv_path.exists():
            _add(zf, kjv_path, "bible/bible_kjv.sqlite", manifest)
        data_dir = REPO / "data"
        for sub, pat in content_globs:
            for p in sorted((data_dir / sub).glob(pat)):
                if p.name == ".gitkeep":
                    continue
                _add(zf, p, f"content/{sub}/{p.name}", manifest)

        meta = {
            "schema": "offline_pack@1",
            "version": args.version,
            "translation": args.translation,
            "files": manifest,
            "file_count": len(manifest),
        }
        zf.writestr("manifest.json", json.dumps(meta, ensure_ascii=False, indent=2))

    # 同时落一份独立 manifest 便于增量校验
    (args.out_dir / f"manifest_{args.version}.json").write_text(
        json.dumps({"version": args.version, "zip": zip_path.name,
                    "zip_sha256": _sha256(zip_path), "files": manifest},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total = sum(m["bytes"] for m in manifest)
    print(f"✓ 离线包：{zip_path}")
    print(f"  文件 {len(manifest)} 个 / 原始 {total/1e6:.1f}MB / 压缩 {zip_path.stat().st_size/1e6:.1f}MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
