"""本章朗读：FHL 和合本章级 MP3 + 可选 Bible Brain 节级 timestamps。"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException

from ..config import get_settings
from . import reader

log = logging.getLogger(__name__)

FHL_AU = "https://bkbible.fhl.net/api/au.php"
FHL_MP3_CDN = "https://media.fhl.net/unv1"
BB_API = "https://4.dbt.io/api"
_HTTP_UA = "Mozilla/5.0 (compatible; BeiAi-Bible/1.0; +https://2sc.prestoai.cn)"
_MIN_MP3_BYTES = 32 * 1024

# 音频源译本（与屏幕译本可解耦）
AUDIO_SOURCES: dict[str, dict] = {
    "cuvs": {
        "label": "和合本",
        "read_label": "FCBH 专业朗读",
        "fhl_version": 0,
        "provider": "fhl",
        "copyright": "音频 · Faith Comes By Hearing（FCBH）· 和合本章级专业录制",
        "granularity": "chapter",
        "bb_language_code": "cmn",
        "bb_fileset_id": "",  # 运行时发现或 .env 覆盖
    },
}

# 屏幕译本 → 默认音频译本（无声源时 unavailable）
SCREEN_TO_AUDIO: dict[str, str | None] = {
    "cuvs": "cuvs",
    "cnv": "cuvs",
    "contemporary": "cuvs",
    "kjv": None,
}


def resolve_audio_version(screen_version: str | None) -> str | None:
    vid = (screen_version or reader.PRIMARY_VERSION).strip().lower()
    mapped = SCREEN_TO_AUDIO.get(vid)
    if mapped is None:
        return None
    return mapped if mapped in AUDIO_SOURCES else None


def _storage_root() -> Path:
    return Path(get_settings().bible_audio_storage_dir)


def _local_path(audio_version: str, book_id: str, chapter: int) -> Path:
    return (
        _storage_root()
        / audio_version
        / book_id.upper()
        / f"{chapter}.mp3"
    )


def _fhl_bid(book_id: str) -> int:
    b = reader.resolve_book(book_id)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book_id}")
    return int(b["sort_order"])


def _fhl_direct_mp3_url(bid: int, chapter: int) -> str:
    """FHL 和合本 unv1 章级 MP3 直链（FCBH 专业录制，无需 au.php）。"""
    return f"{FHL_MP3_CDN}/{bid}/{bid}_{chapter:03d}.mp3"


def fhl_direct_mp3_url(bid: int, chapter: int) -> str:
    """公开：供 stream 502 时重定向至 FHL CDN。"""
    return _fhl_direct_mp3_url(bid, chapter)


def _http_request(url: str, *, method: str = "GET", timeout: int = 60) -> bytes:
    req = urllib.request.Request(
        url,
        method=method,
        headers={"User-Agent": _HTTP_UA},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _fetch_fhl_meta(audio_version: str, book_id: str, chapter: int) -> dict:
    src = AUDIO_SOURCES[audio_version]
    bid = _fhl_bid(book_id)
    url = (
        f"{FHL_AU}?version={src['fhl_version']}&bid={bid}&chap={chapter}"
    )
    try:
        raw = _http_request(url, timeout=45)
        data = json.loads(raw.decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        log.warning("FHL audio meta failed %s %s: %s", book_id, chapter, e)
        raise HTTPException(status_code=502, detail="朗读源暂不可用") from e
    if data.get("status") != "success" or not data.get("mp3"):
        raise HTTPException(status_code=404, detail="此章暂无朗读")
    return data


def _download_mp3(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".mp3.part")
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _HTTP_UA})
            with urllib.request.urlopen(req, timeout=120) as resp:
                with tmp.open("wb") as out:
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        out.write(chunk)
            size = tmp.stat().st_size
            if size < _MIN_MP3_BYTES:
                raise ValueError(f"mp3 too small ({size} bytes)")
            tmp.replace(dest)
            return
        except Exception as e:
            last_err = e
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            log.warning(
                "FHL mp3 download attempt %s failed %s: %s",
                attempt + 1,
                url,
                e,
            )
    raise last_err or RuntimeError("mp3 download failed")


def ensure_cached(audio_version: str, book_id: str, chapter: int) -> Path:
    if audio_version not in AUDIO_SOURCES:
        raise HTTPException(status_code=400, detail=f"未知音频译本：{audio_version}")
    b = reader.resolve_book(book_id)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book_id}")
    cc = int(b["chapter_count"])
    if chapter < 1 or chapter > cc:
        raise HTTPException(status_code=404, detail=f"无此章：{b['name']} {chapter}")

    dest = _local_path(audio_version, b["id"], chapter)
    if dest.is_file():
        size = dest.stat().st_size
        if size >= _MIN_MP3_BYTES:
            return dest
        log.warning("Removing corrupt audio cache %s (%s bytes)", dest, size)
        dest.unlink(missing_ok=True)

    bid = _fhl_bid(b["id"])
    direct_url = _fhl_direct_mp3_url(bid, chapter)
    try:
        _download_mp3(direct_url, dest)
        return dest
    except Exception as e:
        log.warning("FHL direct mp3 failed %s %s: %s", b["id"], chapter, e)
        if dest.exists():
            dest.unlink(missing_ok=True)

    meta = _fetch_fhl_meta(audio_version, b["id"], chapter)
    mp3_url = meta.get("mp3")
    if not mp3_url:
        raise HTTPException(status_code=404, detail="此章暂无朗读")
    try:
        _download_mp3(str(mp3_url), dest)
    except Exception as e:
        log.warning("FHL mp3 download failed: %s", e)
        if dest.exists():
            dest.unlink(missing_ok=True)
        raise HTTPException(status_code=502, detail="朗读加载失败") from e
    return dest


def chapter_entry(
    book_id: str,
    chapter: int,
    *,
    screen_version: str | None = None,
    audio_version: str | None = None,
) -> dict:
    av = audio_version or resolve_audio_version(screen_version)
    if not av:
        return {
            "available": False,
            "book": book_id.upper(),
            "chapter": chapter,
            "screen_version": screen_version,
            "audio_version": None,
        }
    b = reader.resolve_book(book_id)
    if not b or chapter < 1 or chapter > int(b["chapter_count"]):
        return {
            "available": False,
            "book": (b or {}).get("id", book_id.upper()),
            "chapter": chapter,
            "audio_version": av,
        }
    src = AUDIO_SOURCES[av]
    local = _local_path(av, b["id"], chapter)
    cached = local.is_file() and local.stat().st_size >= _MIN_MP3_BYTES
    has_ts = _chapter_has_timestamps(av, b["id"], chapter)
    return {
        "available": True,
        "book": b["id"],
        "book_name": b["name"],
        "chapter": chapter,
        "screen_version": screen_version,
        "audio_version": av,
        "audio_label": src["read_label"],
        "granularity": "verse" if has_ts else src.get("granularity", "chapter"),
        "has_timestamps": has_ts,
        "cached": cached,
        "stream_path": f"/bible/audio/stream/{av}/{b['id']}/{chapter}",
        "fallback_stream_url": _fhl_direct_mp3_url(int(b["sort_order"]), chapter),
        "timestamps_path": f"/bible/audio/timestamps/{av}/{b['id']}/{chapter}",
        "copyright": src["copyright"],
    }


@lru_cache(maxsize=4)
def _manifest_for(audio_version: str) -> dict:
    if audio_version not in AUDIO_SOURCES:
        raise HTTPException(status_code=400, detail=f"未知音频译本：{audio_version}")
    src = AUDIO_SOURCES[audio_version]
    books: dict[str, dict] = {}
    for b in reader.list_books():
        bid = b["id"]
        cc = int(b["chapter_count"])
        books[bid] = {
            "chapter_count": cc,
            "available": True,
        }
    return {
        "version": audio_version,
        "label": src["label"],
        "read_label": src["read_label"],
        "granularity": src.get("granularity", "chapter"),
        "has_timestamps": bool(_bb_key()),
        "copyright": src["copyright"],
        "provider": src["provider"],
        "books": books,
    }


def _timestamps_path(audio_version: str, book_id: str, chapter: int) -> Path:
    return (
        _storage_root()
        / audio_version
        / book_id.upper()
        / f"{chapter}.timestamps.json"
    )


def _bb_key() -> str:
    return (get_settings().bible_brain_api_key or "").strip()


def _bb_get(path: str, params: dict | None = None) -> dict | None:
    key = _bb_key()
    if not key:
        return None
    q = {"key": key, "v": "4", **(params or {})}
    url = f"{BB_API}{path}?{urllib.parse.urlencode(q)}"
    try:
        with urllib.request.urlopen(url, timeout=45) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        log.warning("Bible Brain request failed %s: %s", path, e)
        return None


@lru_cache(maxsize=8)
def _bb_audio_fileset(audio_version: str) -> str:
    src = AUDIO_SOURCES.get(audio_version) or {}
    preset = (src.get("bb_fileset_id") or "").strip()
    if preset:
        return preset
    lang = src.get("bb_language_code") or "cmn"
    body = _bb_get("/bibles", {"language_code": lang, "media": "audio"})
    if not body:
        return ""
    items = body.get("data") if isinstance(body.get("data"), list) else []
    for bible in items:
        abbr = str(bible.get("abbr") or "").upper()
        name = str(bible.get("name") or "")
        if "CUV" in abbr or "UNION" in abbr.upper() or "和合" in name:
            for fs in bible.get("filesets") or []:
                fid = str(fs.get("id") or "")
                if fid.endswith("DA") and "O" not in fid[3:4]:  # mp3 non-drama heuristic
                    return fid
            filesets = bible.get("filesets") or []
            if filesets:
                return str(filesets[0].get("id") or "")
    return ""


def _normalize_bb_timestamps(raw: dict) -> list[dict]:
    rows = raw.get("data")
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        verse = row.get("verse_start") or row.get("verseStart") or row.get("verse")
        ts = row.get("timestamp") or row.get("start") or row.get("time")
        if verse is None or ts is None:
            continue
        try:
            sec = float(ts)
        except (TypeError, ValueError):
            continue
        # BB 可能返回秒或毫秒
        start_ms = int(sec * 1000) if sec < 10000 else int(sec)
        out.append({"verse": int(verse), "start_ms": start_ms})
    out.sort(key=lambda x: x["verse"])
    return out


def get_timestamps(audio_version: str, book_id: str, chapter: int) -> dict:
    b = reader.resolve_book(book_id)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book_id}")
    cache = _timestamps_path(audio_version, b["id"], chapter)
    if cache.is_file():
        try:
            cached = json.loads(cache.read_text(encoding="utf-8"))
            if isinstance(cached.get("verses"), list):
                return cached
        except json.JSONDecodeError:
            pass

    fileset = _bb_audio_fileset(audio_version)
    verses: list[dict] = []
    if fileset:
        raw = _bb_get(f"/timestamps/{fileset}/{b['id']}/{chapter}")
        if raw:
            verses = _normalize_bb_timestamps(raw)

    payload = {
        "book": b["id"],
        "chapter": chapter,
        "audio_version": audio_version,
        "fileset_id": fileset or None,
        "verses": verses,
        "has_timestamps": len(verses) > 0,
    }
    if verses:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def _chapter_has_timestamps(audio_version: str, book_id: str, chapter: int) -> bool:
    cache = _timestamps_path(audio_version, book_id, chapter)
    if cache.is_file():
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            return bool(data.get("has_timestamps")) and bool(data.get("verses"))
        except json.JSONDecodeError:
            return False
    if not _bb_key():
        return False
    return bool(_bb_audio_fileset(audio_version))


def manifest(audio_version: str = "cuvs") -> dict:
    m = _manifest_for(audio_version)
    m["has_timestamps"] = bool(_bb_key()) or any(
        _timestamps_path(audio_version, bid, 1).exists()
        for bid in (list(m.get("books") or {})[:1])
    )
    return m
