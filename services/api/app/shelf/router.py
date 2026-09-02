"""书架公开 API。"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from .service import (
    get_platform_asset_path,
    get_platform_book,
    get_platform_file_bytes,
    get_platform_section,
    list_platform_books,
)

router = APIRouter(prefix="/shelf", tags=["shelf"])


@router.get("/platform")
def shelf_platform_list() -> dict:
    return {"items": list_platform_books()}


@router.get("/platform/{book_id}")
def shelf_platform_detail(book_id: str) -> dict:
    return get_platform_book(book_id, include_sections=True)


@router.get("/platform/{book_id}/sections/{section_id}")
def shelf_platform_section(book_id: str, section_id: str) -> dict:
    return get_platform_section(book_id, section_id)


@router.get("/platform/{book_id}/files/{storage_key}")
def shelf_platform_asset(book_id: str, storage_key: str) -> FileResponse:
    """节内 PDF / 图片 / 视频等资源（storage_key 须在该书资产白名单内）。"""
    try:
        path = get_platform_asset_path(book_id, storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在") from None
    suffix = path.suffix.lower()
    media = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
    }.get(suffix, "application/octet-stream")
    return FileResponse(path, media_type=media, filename=path.name)


@router.get("/platform/{book_id}/file")
def shelf_platform_file(book_id: str) -> Response:
    try:
        data, mime, title = get_platform_file_bytes(book_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="文件不存在") from None
    fname = f"{title}.docx".encode("utf-8").decode("latin-1", errors="replace")
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )
