"""书架转换结果缓存（按源文件 sha256）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .store import REPO_ROOT

CACHE_DIR = REPO_ROOT / "data" / "shelf_html_cache"


def cache_dir() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return CACHE_DIR


def html_cache_path(sha256: str) -> Path:
    return cache_dir() / f"{sha256}.html"


def meta_cache_path(sha256: str) -> Path:
    return cache_dir() / f"{sha256}.meta.json"


def read_html_cache(sha256: str) -> str | None:
    path = html_cache_path(sha256)
    if not path.is_file():
        return None
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def write_html_cache(sha256: str, html: str) -> None:
    if not sha256 or not html:
        return
    path = html_cache_path(sha256)
    path.write_text(html, encoding="utf-8")


def read_meta_cache(sha256: str) -> dict[str, Any] | None:
    path = meta_cache_path(sha256)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def write_meta_cache(sha256: str, meta: dict[str, Any]) -> None:
    if not sha256:
        return
    meta_cache_path(sha256).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
