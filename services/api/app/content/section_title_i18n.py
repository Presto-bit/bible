"""段落小标题 zh→en（KJV 等英文 UI；无译名时回退中文原文）。"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from .loader import _data_dir


@lru_cache(maxsize=1)
def section_title_en_map() -> dict[str, str]:
    path = _data_dir() / "bible/cnv/section_titles_en.json"
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if isinstance(raw, dict) and isinstance(raw.get("titles"), dict):
        return {str(k): str(v) for k, v in raw["titles"].items()}
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items()}
    return {}


def localize_section_title(title: str, lang: str | None) -> str:
    """lang=en 时用英译表；缺项回退中文 title。"""
    zh = (title or "").strip()
    if not zh:
        return zh
    code = (lang or "zh").strip().lower()
    if code not in ("en", "english"):
        return zh
    return section_title_en_map().get(zh, zh)


def localize_section_marks(
    marks: list[dict],
    lang: str | None,
) -> list[dict]:
    out: list[dict] = []
    for m in marks:
        verse = int(m.get("verse") or 0)
        title = localize_section_title(str(m.get("title") or ""), lang)
        if verse > 0 and title:
            out.append({"verse": verse, "title": title})
    return out
