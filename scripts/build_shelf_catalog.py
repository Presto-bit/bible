#!/usr/bin/env python3
"""从 DOCX 生成 data/shelf/platform_catalog.json（无需 PostgreSQL）。"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "services" / "api"
sys.path.insert(0, str(API))

DEFAULT_BOOK_ID = "00000000-0000-4000-8000-000000000001"
DEFAULT_STORAGE = "shelf-grace-comfort-salvation.docx"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build platform shelf file catalog")
    parser.add_argument(
        "docx",
        nargs="?",
        default=str(Path.home() / "Desktop" / "恩典的安慰与活出来的救恩.docx"),
    )
    parser.add_argument("--book-id", default=DEFAULT_BOOK_ID)
    parser.add_argument("--storage-key", default=DEFAULT_STORAGE)
    parser.add_argument("--sort-order", type=int, default=100)
    args = parser.parse_args()

    src = Path(args.docx).expanduser()
    if not src.is_file():
        print(f"File not found: {src}", file=sys.stderr)
        sys.exit(1)

    from app.shelf.docx_parse import file_sha256, parse_docx_bytes

    data = src.read_bytes()
    parsed = parse_docx_bytes(data)
    sha = file_sha256(data)

    uploads = ROOT / "data" / "shelf_uploads"
    uploads.mkdir(parents=True, exist_ok=True)
    dest = uploads / args.storage_key
    if src.resolve() != dest.resolve():
        shutil.copy2(src, dest)

    book = {
        "id": args.book_id,
        "title": parsed.get("title") or src.stem,
        "subtitle": parsed.get("subtitle") or "",
        "author": parsed.get("author") or "",
        "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "storage_key": args.storage_key,
        "file_size": len(data),
        "file_sha256": sha,
        "toc": parsed.get("toc") or {},
        "sections": parsed.get("sections") or [],
        "status": "published",
        "sort_order": args.sort_order,
        "group_id": "devotional",
    }

    catalog_path = ROOT / "data" / "shelf" / "platform_catalog.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    items: list = []
    groups = None
    if catalog_path.is_file():
        raw = json.loads(catalog_path.read_text(encoding="utf-8"))
        items = [i for i in (raw.get("items") or []) if i.get("id") != args.book_id]
        groups = raw.get("groups")
    items.append(book)
    items.sort(key=lambda b: int(b.get("sort_order") or 0), reverse=True)
    out_doc: dict = {"items": items}
    if groups:
        out_doc["groups"] = groups
    catalog_path.write_text(
        json.dumps(out_doc, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Built platform shelf catalog:")
    print(f"  title: {book['title']}")
    print(f"  sections: {len(book['sections'])}")
    print(f"  storage: {dest}")
    print(f"  catalog: {catalog_path}")


if __name__ == "__main__":
    main()
