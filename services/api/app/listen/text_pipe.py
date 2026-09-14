"""AI 听经：文本规范化与章引子。"""
from __future__ import annotations

import hashlib
import re
import unicodedata

from ..bible.reader import VERSIONS, book_name

# 产品 voice_id → MiniMax 系统音色
VOICE_MAP: dict[str, str] = {
    "voice_calm_m": "audiobook_male_1",  # 沉稳男声（读经向）
}

DEFAULT_VOICE = "voice_calm_m"
MODEL = "speech-2.8-turbo"
# 合成策略变更（分块+字幕轴）时递增，避免与旧「按节多请求」缓存混用
PROSODY_VER = "v2-chunk-sub"


def normalize_verse_text(text: str) -> str:
    """去掉节号痕迹、规范空白与神名前全角空格。"""
    t = unicodedata.normalize("NFC", (text or "").strip())
    # 行首节号类（极少出现在正文）
    t = re.sub(r"^[\d０-９]+\s*", "", t)
    # 全角空格压缩为普通空格，再去掉「神」前多余空格
    t = t.replace("\u3000", " ")
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+(神)", r"\1", t)
    return t


def chapter_intro(book_id: str, chapter: int) -> str:
    name = book_name(book_id) or book_id
    return f"{name} 第{int(chapter)}章。"


def translation_label(translation: str) -> str:
    return VERSIONS.get(translation, translation)


def build_verse_units(
    book_id: str, chapter: int, verses: list[dict]
) -> list[dict]:
    """返回 [{kind, verse|None, text}, ...]，首段为章引子。"""
    units: list[dict] = [{"kind": "intro", "verse": None, "text": chapter_intro(book_id, chapter)}]
    for row in verses:
        body = normalize_verse_text(str(row.get("text") or ""))
        if not body:
            continue
        units.append(
            {
                "kind": "verse",
                "verse": int(row["verse"]),
                "text": body,
            }
        )
    return units


def chapter_text_hash(
    *,
    translation: str,
    voice: str,
    units: list[dict],
) -> str:
    payload = "|".join(
        f"{u['kind']}:{u.get('verse')}:{u['text']}" for u in units
    )
    raw = f"{translation}|{MODEL}|{voice}|{PROSODY_VER}|{payload}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]
