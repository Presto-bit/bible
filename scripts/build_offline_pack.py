#!/usr/bin/env python3
"""打离线包：经文 SQLite + 静态内容 → 可供 Flutter assets / 下载分发的 zip。

产物：build/offline_pack/bible_offline_<version>.zip + manifest_<version>.json（含 sha256）。
内容（所有存在的 sqlite 均打入）：
  bible/bible_cnv.sqlite          新译本
  bible/bible_cuvs.sqlite         和合本（主译本；manifest 含独立直链字段）
  bible/bible_contemporary.sqlite 当代译本（开放源 CC BY-SA 4.0）
  bible/bible_kjv.sqlite          KJV
  content/plans/*.csv|json        读经/祷告计划
  content/daily-verses/*.json     每日经文
  content/crossrefs/*.json|sqlite 交叉引用
  content/dictionary/*.json       词典
  content/topics/*.json           人生主题
  content/geography/*.json        地理与历史
  content/summaries/*.json        篇章摘要
  content/strongs/*.sqlite        原文工具
  content/illustrations/*.json|svg 主题插画

用法：
  python scripts/build_offline_pack.py [--version 2026.07.29]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# 按需打入的额外译本（存在才加）；主 translation 由 --translation 指定，默认 cnv
EXTRA_TRANSLATIONS = ["cuvs", "contemporary", "kjv"]


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
    ap.add_argument("--translation", default="cnv", help="主译本 id（一定打入）")
    ap.add_argument("--out-dir", type=Path, default=REPO / "build" / "offline_pack")
    args = ap.parse_args()

    primary_path = REPO / "build" / f"bible_{args.translation}.sqlite"
    if not primary_path.exists():
        raise SystemExit(f"缺少经库：{primary_path}（先跑 import_bible.py）")

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
        # 主译本
        arc_primary = f"bible/bible_{args.translation}.sqlite"
        _add(zf, primary_path, arc_primary, manifest)

        # 其它译本（存在则加，不报错）
        for tid in EXTRA_TRANSLATIONS:
            if tid == args.translation:
                continue
            p = REPO / "build" / f"bible_{tid}.sqlite"
            if p.exists():
                _add(zf, p, f"bible/bible_{tid}.sqlite", manifest)
            else:
                print(f"  ⚠ 跳过 {tid}（build/bible_{tid}.sqlite 不存在）")

        # 静态内容
        data_dir = REPO / "data"
        for sub, pat in content_globs:
            for p in sorted((data_dir / sub).glob(pat)):
                if p.name == ".gitkeep":
                    continue
                _add(zf, p, f"content/{sub}/{p.name}", manifest)

        # zip 内 manifest
        meta = {
            "schema": "offline_pack@1",
            "version": args.version,
            "translation": args.translation,
            "files": manifest,
            "file_count": len(manifest),
        }
        zf.writestr("manifest.json", json.dumps(meta, ensure_ascii=False, indent=2))

    zip_sha = _sha256(zip_path)

    # 外部独立 manifest（含和合本直链字段，供前端单独拉 cuvs.sqlite 走快速通道）
    cuvs_entry = next((f for f in manifest if f["path"] == "bible/bible_cuvs.sqlite"), None)
    outer: dict = {
        "version": args.version,
        "zip": zip_path.name,
        "zip_sha256": zip_sha,
        "files": manifest,
    }
    if cuvs_entry:
        outer["cuvs_sqlite"] = "bible_cuvs.sqlite"
        outer["cuvs_sqlite_sha256"] = cuvs_entry["sha256"]
        outer["cuvs_sqlite_bytes"] = cuvs_entry["bytes"]

    (args.out_dir / f"manifest_{args.version}.json").write_text(
        json.dumps(outer, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total = sum(m["bytes"] for m in manifest)
    print(f"✓ 离线包：{zip_path}")
    print(f"  文件 {len(manifest)} 个 / 原始 {total/1e6:.1f} MB / 压缩 {zip_path.stat().st_size/1e6:.1f} MB")
    included = [f["path"] for f in manifest if f["path"].startswith("bible/")]
    print(f"  译本：{included}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
