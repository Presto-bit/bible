"""AI 听经：文本规范化与章引子。"""
from __future__ import annotations

import hashlib
import re
import unicodedata

from ..bible.reader import VERSIONS, book_name, list_books

# 产品 voice_id → MiniMax 系统音色
VOICE_MAP: dict[str, str] = {
    "voice_calm_m": "Chinese_pangban_male",  # 沉稳男声（旁白男）
    "voice_gentle_f": "Chinese_wenrounvxing",  # 温柔女声
}

VOICE_LABELS: dict[str, str] = {
    "voice_calm_m": "沉稳男声",
    "voice_gentle_f": "温柔女声",
}

DEFAULT_VOICE = "voice_calm_m"
MODEL = "speech-2.8-turbo"
# 合成策略变更时递增，避免旧缓存混用（v6：英文译本章头 + language_boost）
PROSODY_VER = "v6-en-intro"

# 英文译本（章头 / TTS language_boost）
_ENGLISH_TRANSLATIONS = frozenset({"kjv", "niv"})


def is_english_translation(translation: str | None) -> bool:
    return (translation or "").strip().lower() in _ENGLISH_TRANSLATIONS


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


def _chapter_spoken(n: int) -> str:
    """章号口语：1→一，10→十，23→二十三（便于 TTS 读清「第几章」）。"""
    n = int(n)
    if n <= 0:
        return str(n)
    digits = "零一二三四五六七八九"
    if n < 10:
        return digits[n]
    if n == 10:
        return "十"
    if n < 20:
        return "十" + digits[n % 10]
    if n < 100:
        tens, ones = divmod(n, 10)
        return digits[tens] + "十" + (digits[ones] if ones else "")
    if n == 100:
        return "一百"
    if n < 110:
        return "一百零" + digits[n % 10] if n % 10 else "一百"
    if n < 120:
        return "一百一十" + (digits[n % 10] if n % 10 else "")
    # 120–150：一百二十…
    hundreds, rest = divmod(n, 100)
    head = digits[hundreds] + "百" if hundreds > 1 else "一百"
    if rest == 0:
        return head
    if rest < 10:
        return head + "零" + digits[rest]
    return head + _chapter_spoken(rest)


def _book_display_name(book_id: str, translation: str | None) -> str:
    bid = (book_id or "").upper()
    if is_english_translation(translation):
        try:
            for b in list_books(translation or "kjv"):
                if str(b.get("id") or "").upper() == bid:
                    name = str(b.get("name") or "").strip()
                    if name:
                        return name
        except Exception:
            pass
    return book_name(bid) or bid


def chapter_intro(
    book_id: str,
    chapter: int,
    *,
    translation: str | None = None,
) -> str:
    """章头播报：卷名 + 第几章（独立成句，便于听清）。英文译本用 English。"""
    name = _book_display_name(book_id, translation)
    if is_english_translation(translation):
        return f"{name}. Chapter {int(chapter)}."
    return f"{name}。第{_chapter_spoken(chapter)}章。"


def translation_label(translation: str) -> str:
    return VERSIONS.get(translation, translation)


def tts_language_boost(translation: str | None) -> str:
    return "English" if is_english_translation(translation) else "Chinese"


def build_verse_units(
    book_id: str,
    chapter: int,
    verses: list[dict],
    *,
    translation: str | None = None,
) -> list[dict]:
    """返回 [{kind, verse|None, text}, ...]，首段为章引子。"""
    units: list[dict] = [
        {
            "kind": "intro",
            "verse": None,
            "text": chapter_intro(book_id, chapter, translation=translation),
        }
    ]
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
