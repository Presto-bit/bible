"""听经 API：/listen/*"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..auth.rate_limit import enforce_rate_limit
from ..bible.reader import VERSIONS, available_versions, book_name, get_chapter
from ..config import get_settings
from .cache import read_ready
from .jobs import get_job, prune_jobs, start_job
from .synthesize import prepare_chapter
from .text_pipe import DEFAULT_VOICE, VOICE_MAP, build_verse_units, chapter_text_hash, translation_label

router = APIRouter(prefix="/listen", tags=["listen"])


def _next_chapter(book: str, chapter: int, translation: str) -> dict | None:
    """同书下一章；无经文则 None（卷末不跳卷）。"""
    try:
        nxt = get_chapter(book, chapter + 1, translation)
    except Exception:
        return None
    if not nxt:
        return None
    return {"book": book.upper(), "chapter": int(chapter) + 1}


def _media_url(translation: str, voice: str, text_hash: str) -> str:
    # 相对路径：由客户端拼 API_BASE，避免服务端 api_base_url 与现网域名不一致
    return f"/listen/media/{translation}/{voice}/{text_hash}.mp3"


def _ready_payload(ready: dict, *, book: str, chapter: int) -> dict:
    th = ready["text_hash"]
    tr = ready["translation"]
    voice = ready["voice"]
    return {
        "status": "ready",
        "url": _media_url(tr, voice, th),
        "timeline": ready.get("timeline") or [],
        "duration_ms": ready.get("duration_ms") or 0,
        "text_hash": th,
        "translation": tr,
        "translation_label": translation_label(tr),
        "voice": voice,
        "book": book.upper(),
        "chapter": int(chapter),
        "book_name": book_name(book) or book.upper(),
        "next": _next_chapter(book, chapter, tr),
    }


@router.get("/voices")
def list_voices() -> dict:
    return {
        "voices": [
            {
                "id": DEFAULT_VOICE,
                "label": "沉稳男声",
                "default": True,
            }
        ]
    }


@router.get("/chapter")
def listen_chapter(
    request: Request,
    translation: str = Query(..., min_length=2, max_length=32),
    book: str = Query(..., min_length=2, max_length=8),
    chapter: int = Query(..., ge=1, le=200),
    voice: str = Query(DEFAULT_VOICE),
    sync: int = Query(0, ge=0, le=1),
):
    """缓存命中 200；否则 202 pending（sync=1 时同步等待，仅调试）。"""
    enforce_rate_limit(request, bucket="listen_chapter", limit=30, window_sec=60)
    prune_jobs()

    translation = translation.strip().lower()
    if translation not in VERSIONS:
        raise HTTPException(400, detail="未知译本")
    avail = {v["id"] for v in available_versions() if v.get("available")}
    if translation not in avail:
        raise HTTPException(404, detail="译本不可用")

    voice = voice if voice in VOICE_MAP else DEFAULT_VOICE
    book = book.upper()

    try:
        verses = get_chapter(book, chapter, translation)
    except FileNotFoundError as e:
        raise HTTPException(404, detail=str(e)) from e
    if not verses:
        raise HTTPException(404, detail="本章无经文")

    units = build_verse_units(book, chapter, verses)
    text_hash = chapter_text_hash(translation=translation, voice=voice, units=units)
    hit = read_ready(translation, voice, text_hash)
    if hit:
        return _ready_payload(hit, book=book, chapter=chapter)

    if not (get_settings().minimax_api_key or "").strip():
        raise HTTPException(503, detail="听读服务未配置")

    if sync == 1:
        try:
            ready = prepare_chapter(
                translation=translation, book=book, chapter=chapter, voice=voice
            )
        except Exception as e:
            raise HTTPException(502, detail=f"合成失败：{e}") from e
        return _ready_payload(ready, book=book, chapter=chapter)

    job_id = start_job(
        translation=translation, book=book, chapter=chapter, voice=voice
    )
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=202,
        content={"status": "pending", "job_id": job_id, "text_hash": text_hash},
    )


@router.get("/jobs/{job_id}")
def listen_job(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(404, detail="任务不存在")
    status = job.get("status")
    if status == "pending":
        return {"status": "pending", "job_id": job_id}
    if status == "error":
        return {"status": "error", "job_id": job_id, "error": job.get("error")}
    result = job.get("result") or {}
    book = result.get("book") or job.get("book")
    chapter = int(result.get("chapter") or job.get("chapter") or 1)
    # 补 url
    ready = {
        **result,
        "translation": result.get("translation") or job.get("translation"),
        "voice": result.get("voice") or job.get("voice"),
    }
    return _ready_payload(ready, book=book, chapter=chapter)


@router.get("/media/{translation}/{voice}/{name}")
def listen_media(translation: str, voice: str, name: str):
    if not name.endswith(".mp3"):
        raise HTTPException(404)
    text_hash = name[:-4]
    if len(text_hash) < 16 or "/" in text_hash:
        raise HTTPException(404)
    from .cache import cache_paths

    mp3, _meta = cache_paths(translation, voice, text_hash)
    if not mp3.is_file():
        raise HTTPException(404, detail="音频不存在")
    return FileResponse(
        path=str(mp3),
        media_type="audio/mpeg",
        filename=f"{text_hash}.mp3",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
