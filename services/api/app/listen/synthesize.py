"""按节并行合成并拼接。"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from ..bible.reader import get_chapter
from .cache import read_ready, write_ready
from .minimax_tts import synthesize_mp3
from .text_pipe import (
    DEFAULT_VOICE,
    MODEL,
    VOICE_MAP,
    build_verse_units,
    chapter_text_hash,
)

log = logging.getLogger(__name__)

# 并行节数上限，避免打爆 MiniMax RPM
_MAX_WORKERS = 4


def prepare_chapter(
    *,
    translation: str,
    book: str,
    chapter: int,
    voice: str = DEFAULT_VOICE,
) -> dict:
    voice = voice if voice in VOICE_MAP else DEFAULT_VOICE
    mm_voice = VOICE_MAP[voice]
    book = book.upper()
    chapter = int(chapter)

    verses = get_chapter(book, chapter, translation)
    if not verses:
        raise FileNotFoundError(f"无经文 {translation} {book}.{chapter}")

    units = build_verse_units(book, chapter, verses)
    text_hash = chapter_text_hash(translation=translation, voice=voice, units=units)

    hit = read_ready(translation, voice, text_hash)
    if hit:
        return hit

    # 按节合成（含 intro）
    parts: list[tuple[int, bytes, int, dict]] = []

    def _one(idx: int, unit: dict) -> tuple[int, bytes, int, dict]:
        raw, dur, _usage = synthesize_mp3(
            text=unit["text"],
            voice_id=mm_voice,
            model=MODEL,
        )
        return idx, raw, dur, unit

    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as pool:
        futs = [pool.submit(_one, i, u) for i, u in enumerate(units)]
        for fut in as_completed(futs):
            parts.append(fut.result())

    parts.sort(key=lambda x: x[0])
    timeline: list[dict] = []
    cursor = 0
    blobs: list[bytes] = []
    for _i, raw, dur, unit in parts:
        start = cursor
        end = cursor + max(dur, 1)
        if unit["kind"] == "verse" and unit.get("verse") is not None:
            timeline.append(
                {
                    "verse": int(unit["verse"]),
                    "start_ms": start,
                    "end_ms": end,
                }
            )
        blobs.append(raw)
        cursor = end

    # 同规格 mp3 帧流可直接拼接
    mp3 = b"".join(blobs)
    return write_ready(
        translation=translation,
        voice=voice,
        text_hash=text_hash,
        mp3=mp3,
        timeline=timeline,
        duration_ms=cursor,
        book=book,
        chapter=chapter,
    )
