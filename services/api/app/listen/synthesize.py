"""听经合成：少次 TTS + 字幕映射节时间轴（控 RPM）。"""
from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

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

# 单次请求字符上限（官方 1 万；尽量整章一次，避免裸拼 MP3 被播放器截断）
_CHUNK_CHARS = 9000


def _tts_sentence(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if not re.search(r"[。！？.!?]$", t):
        t += "。"
    return t


def _concat_mp3(blobs: list[bytes]) -> bytes:
    """拼接多段同规格 MP3；优先 ffmpeg，避免时长头导致只播第一段。"""
    if not blobs:
        return b""
    if len(blobs) == 1:
        return blobs[0]
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log.warning("listen: ffmpeg 不可用，裸拼 MP3 可能只播首段")
        return b"".join(blobs)
    with tempfile.TemporaryDirectory(prefix="listen_mp3_") as td:
        root = Path(td)
        names: list[str] = []
        for i, raw in enumerate(blobs):
            name = f"p{i:03d}.mp3"
            (root / name).write_bytes(raw)
            names.append(name)
        lst = root / "concat.txt"
        lst.write_text("".join(f"file '{n}'\n" for n in names), encoding="utf-8")
        out = root / "out.mp3"
        try:
            subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(lst),
                    "-c",
                    "copy",
                    str(out),
                ],
                check=True,
                capture_output=True,
                timeout=120,
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
            log.warning("listen: ffmpeg concat 失败，回退裸拼: %s", e)
            return b"".join(blobs)
        data = out.read_bytes()
        if len(data) < 64:
            return b"".join(blobs)
        return data


def _build_chunks(units: list[dict]) -> list[dict]:
    """把 units 切成若干块。

    实际送 TTS 的文本用换行分隔句子，便于 MiniMax 出句级字幕；
    但 text_begin 索引不计换行，故 ranges 按「无换行拼接」计坐标。
    章引子与正文同块，避免多段 MP3 播放截断。
    """
    chunks: list[dict] = []
    cur_ranges: list[tuple[dict, int, int]] = []
    sentences: list[str] = []
    cursor = 0  # 不计换行

    def flush() -> None:
        nonlocal cur_ranges, sentences, cursor
        if not sentences:
            return
        chunks.append(
            {
                "text": "\n".join(sentences),
                "ranges": cur_ranges,
            }
        )
        cur_ranges = []
        sentences = []
        cursor = 0

    for unit in units:
        sent = _tts_sentence(str(unit.get("text") or ""))
        if not sent:
            continue
        # 块大小按「有效字」估算（不含换行）
        if sentences and cursor + len(sent) > _CHUNK_CHARS:
            flush()
        start = cursor
        cursor += len(sent)
        end = cursor
        sentences.append(sent)
        cur_ranges.append((unit, start, end))
    flush()
    return chunks


def _timeline_from_subtitles(
    ranges: list[tuple[dict, int, int]],
    subtitles: list[dict],
    *,
    time_offset_ms: int,
    fallback_duration_ms: int,
) -> list[dict]:
    """用字幕 time_* 与 text_* 映射到 verse timeline。"""
    acc: dict[int, list[int]] = {}

    def hit_unit(char_pos: int) -> dict | None:
        for unit, a, b in ranges:
            if a <= char_pos < b:
                return unit
        if ranges and char_pos >= ranges[-1][2]:
            return ranges[-1][0]
        return ranges[0][0] if ranges else None

    for sub in subtitles:
        try:
            tb = int(float(sub.get("time_begin") or 0))
            te = int(float(sub.get("time_end") or 0))
            cb = int(float(sub.get("text_begin") or 0))
        except (TypeError, ValueError):
            continue
        unit = hit_unit(cb)
        if not unit or unit.get("kind") != "verse" or unit.get("verse") is None:
            continue
        v = int(unit["verse"])
        start = time_offset_ms + max(0, tb)
        end = time_offset_ms + max(start + 1, te)
        if v not in acc:
            acc[v] = [start, end]
        else:
            acc[v][0] = min(acc[v][0], start)
            acc[v][1] = max(acc[v][1], end)

    if acc:
        return [
            {"verse": v, "start_ms": se[0], "end_ms": se[1]}
            for v, se in sorted(acc.items(), key=lambda x: x[0])
        ]

    # 无字幕：按字符占比粗分（仅兜底）
    total_chars = sum(max(1, b - a) for _, a, b in ranges)
    cursor = time_offset_ms
    out: list[dict] = []
    for unit, a, b in ranges:
        share = max(1, b - a)
        dur = max(1, int(fallback_duration_ms * share / max(1, total_chars)))
        if unit.get("kind") == "verse" and unit.get("verse") is not None:
            out.append(
                {
                    "verse": int(unit["verse"]),
                    "start_ms": cursor,
                    "end_ms": cursor + dur,
                }
            )
        cursor += dur
    return out


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

    chunks = _build_chunks(units)
    if not chunks:
        raise RuntimeError("无可合成文本")

    blobs: list[bytes] = []
    timeline: list[dict] = []
    cursor = 0

    for i, chunk in enumerate(chunks):
        log.info(
            "listen synth %s.%s chunk %s/%s chars=%s",
            book,
            chapter,
            i + 1,
            len(chunks),
            len(chunk["text"]),
        )
        raw, dur, _usage, subs = synthesize_mp3(
            text=chunk["text"],
            voice_id=mm_voice,
            model=MODEL,
            with_subtitles=True,
        )
        piece_tl = _timeline_from_subtitles(
            chunk["ranges"],
            subs,
            time_offset_ms=cursor,
            fallback_duration_ms=dur,
        )
        timeline.extend(piece_tl)
        blobs.append(raw)
        cursor += max(dur, 1)

    # 合并同节（跨 chunk 极少见；同 chunk 多句已在 acc 合并）
    merged: dict[int, dict] = {}
    for item in timeline:
        v = int(item["verse"])
        if v not in merged:
            merged[v] = dict(item)
        else:
            merged[v]["start_ms"] = min(merged[v]["start_ms"], item["start_ms"])
            merged[v]["end_ms"] = max(merged[v]["end_ms"], item["end_ms"])
    timeline = [merged[k] for k in sorted(merged)]

    mp3 = _concat_mp3(blobs)
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
