"""听经音频本地缓存。"""
from __future__ import annotations

import json
from pathlib import Path

from ..config import get_settings


def _root() -> Path:
    s = get_settings()
    p = Path(s.listen_storage_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def cache_paths(translation: str, voice: str, text_hash: str) -> tuple[Path, Path]:
    base = _root() / translation / "minimax" / "speech-2.8-turbo" / voice
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{text_hash}.mp3", base / f"{text_hash}.json"


def read_ready(translation: str, voice: str, text_hash: str) -> dict | None:
    mp3, meta = cache_paths(translation, voice, text_hash)
    if not mp3.exists() or not meta.exists():
        return None
    try:
        data = json.loads(meta.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    data["mp3_path"] = str(mp3)
    data["text_hash"] = text_hash
    data["status"] = "ready"
    return data


def write_ready(
    *,
    translation: str,
    voice: str,
    text_hash: str,
    mp3: bytes,
    timeline: list[dict],
    duration_ms: int,
    book: str,
    chapter: int,
) -> dict:
    mp3_path, meta_path = cache_paths(translation, voice, text_hash)
    mp3_path.write_bytes(mp3)
    payload = {
        "status": "ready",
        "translation": translation,
        "voice": voice,
        "text_hash": text_hash,
        "book": book,
        "chapter": chapter,
        "duration_ms": duration_ms,
        "timeline": timeline,
        "bytes": len(mp3),
    }
    meta_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    payload["mp3_path"] = str(mp3_path)
    return payload
