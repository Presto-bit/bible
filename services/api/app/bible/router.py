"""经文只读接口（供 FE 目录/阅读器与调试）。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse

from . import audio, reader
from .refs import parse_ref

router = APIRouter(prefix="/bible", tags=["bible"])


@router.get("/books")
def books() -> dict:
    return {"books": reader.list_books()}


@router.get("/versions")
def versions() -> dict:
    return {"versions": reader.available_versions()}


@router.get("/chapter")
def chapter(
    book: str = Query(..., description="卷 id 或中文名，如 JHN / 约翰福音"),
    chapter: int = Query(..., ge=1),
    version: str | None = Query(
        None,
        description="译本 id：cuvs / cnv / contemporary / kjv（默认主译本和合本）",
    ),
) -> dict:
    b = reader.resolve_book(book)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book}")
    ver = (version or "").strip().lower() or reader.PRIMARY_VERSION
    if ver not in reader.VERSIONS:
        ver = reader.PRIMARY_VERSION
    verses = reader.get_chapter(b["id"], chapter, version=ver)
    if not verses:
        raise HTTPException(status_code=404, detail=f"无此章：{b['name']} {chapter}")
    return {
        "book": b["id"],
        "name": b["name"],
        "chapter": chapter,
        "version": ver,
        "verses": verses,
    }


@router.get("/compare")
def compare(
    ref: str = Query(..., description="单节引用，如 JHN.3.16 / 约翰福音3:16"),
) -> dict:
    r = parse_ref(ref)
    if r is None or r.chapter is None or r.verse_start is None:
        raise HTTPException(status_code=400, detail=f"需指定到节：{ref}")
    return reader.compare_verse(r.book_id, r.chapter, r.verse_start)


@router.get("/search")
def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(40, ge=1, le=200),
    offset: int = Query(0, ge=0),
    version: str | None = Query(None, description="译本 id：cuvs / cnv / contemporary / kjv"),
    testament: str | None = Query(None, description="OT / NT"),
) -> dict:
    test = (testament or "").strip().upper() or None
    if test and test not in ("OT", "NT"):
        raise HTTPException(status_code=400, detail="testament 须为 OT 或 NT")
    ver = (version or "").strip().lower() or None
    if ver and ver not in reader.VERSIONS:
        raise HTTPException(status_code=400, detail=f"未知译本：{version}")
    result = reader.search_verses(
        q, limit=limit, offset=offset, version=ver, testament=test,
    )
    hits = result["hits"]
    total = int(result["total"])
    return {
        "query": q,
        "hits": hits,
        "total": total,
        "total_ot": int(result.get("total_ot") or 0),
        "total_nt": int(result.get("total_nt") or 0),
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(hits) < total,
        "version": result.get("version") or ver,
        "testament": test,
    }


@router.get("/ref")
def by_ref(ref: str = Query(..., description="经文引用，如 JHN.3.16 / 约翰福音3:16-18")) -> dict:
    r = parse_ref(ref)
    if r is None or r.chapter is None:
        raise HTTPException(status_code=400, detail=f"无法解析引用：{ref}")
    if r.verse_start is not None:
        verses = reader.get_verses(r.book_id, r.chapter, r.verse_start, r.verse_end)
    else:
        verses = reader.get_chapter(r.book_id, r.chapter)
    return {"ref": r.osis, "display": r.display, "verses": verses}


@router.get("/audio/manifest")
def audio_manifest(
    version: str = Query("cuvs", description="音频源译本 id"),
) -> dict:
    ver = (version or "cuvs").strip().lower()
    return audio.manifest(ver)


@router.get("/audio/chapter")
def audio_chapter(
    book: str = Query(..., description="卷 id，如 JHN"),
    chapter: int = Query(..., ge=1),
    version: str | None = Query(None, description="屏幕译本 id"),
    audio_version: str | None = Query(None, description="音频源译本 id"),
) -> dict:
    av = (audio_version or "").strip().lower() or None
    sv = (version or "").strip().lower() or None
    b = reader.resolve_book(book)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book}")
    resolved_av = av or audio.resolve_audio_version(sv)
    return audio.chapter_entry(
        b["id"], chapter, screen_version=sv, audio_version=resolved_av
    )


@router.get("/audio/timestamps/{audio_version}/{book}/{chapter}")
def audio_timestamps(audio_version: str, book: str, chapter: int) -> dict:
    b = reader.resolve_book(book)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book}")
    ver = audio_version.strip().lower()
    return audio.get_timestamps(ver, b["id"], chapter)


@router.get("/audio/stream/{audio_version}/{book}/{chapter}")
def audio_stream(audio_version: str, book: str, chapter: int):
    b = reader.resolve_book(book)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book}")
    ver = audio_version.strip().lower()
    try:
        path = audio.ensure_cached(ver, b["id"], chapter)
    except HTTPException as exc:
        if exc.status_code != 502:
            raise
        bid = int(b["sort_order"])
        return RedirectResponse(
            audio.fhl_direct_mp3_url(bid, chapter),
            status_code=307,
        )
    return FileResponse(
        path,
        media_type="audio/mpeg",
        filename=f"{b['id']}_{chapter}.mp3",
    )
