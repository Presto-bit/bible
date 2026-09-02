"""平台书架文件存储（本地 data/shelf_uploads）。"""
from __future__ import annotations

import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SHELF_DIR = REPO_ROOT / "data" / "shelf_uploads"


def shelf_dir() -> Path:
    SHELF_DIR.mkdir(parents=True, exist_ok=True)
    return SHELF_DIR


def save_shelf_bytes(data: bytes, *, suffix: str = ".docx") -> str:
    key = f"shelf-{uuid.uuid4().hex}{suffix}"
    dest = shelf_dir() / key
    dest.write_bytes(data)
    return key


def read_shelf_bytes(storage_key: str) -> bytes:
    name = Path(storage_key).name
    path = shelf_dir() / name
    if not path.is_file():
        raise FileNotFoundError(storage_key)
    return path.read_bytes()


def shelf_file_path(storage_key: str) -> Path:
    return shelf_dir() / Path(storage_key).name
