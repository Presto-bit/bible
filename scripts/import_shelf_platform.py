#!/usr/bin/env python3
"""导入平台书架 DOCX（管理员首发书目）。"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = ROOT / "services" / "api"
sys.path.insert(0, str(API))

# 本地开发默认 DATABASE_URL
os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/bible"),
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import platform shelf DOCX")
    parser.add_argument(
        "docx",
        nargs="?",
        default=str(Path.home() / "Desktop" / "恩典的安慰与活出来的救恩.docx"),
        help="Path to .docx file",
    )
    parser.add_argument("--title", default=None)
    parser.add_argument("--replace-sha", default=None, help="Replace book with this sha256")
    args = parser.parse_args()

    path = Path(args.docx).expanduser()
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        sys.exit(1)

    data = path.read_bytes()
    from app.shelf.service import import_platform_docx

    result = import_platform_docx(
        data,
        title=args.title,
        sort_order=100,
        replace_sha256=args.replace_sha,
    )
    print("Imported platform shelf book:")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
