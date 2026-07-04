"""经文只读接口（供 FE 目录/阅读器与调试）。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from . import reader
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
    version: str = Query("cnv", description="译本 id：cnv / cuvs / kjv"),
) -> dict:
    b = reader.resolve_book(book)
    if not b:
        raise HTTPException(status_code=404, detail=f"未知卷：{book}")
    ver = version if version in reader.VERSIONS else reader.PRIMARY_VERSION
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
    limit: int = Query(24, ge=1, le=50),
    version: str | None = Query(None, description="译本 id：cnv / cuvs / kjv"),
    testament: str | None = Query(None, description="OT / NT"),
) -> dict:
    test = (testament or "").strip().upper() or None
    if test and test not in ("OT", "NT"):
        raise HTTPException(status_code=400, detail="testament 须为 OT 或 NT")
    ver = (version or "").strip().lower() or None
    if ver and ver not in reader.VERSIONS:
        raise HTTPException(status_code=400, detail=f"未知译本：{version}")
    hits = reader.search_verses(q, limit=limit, version=ver, testament=test)
    return {"query": q, "hits": hits, "version": ver, "testament": test}


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
