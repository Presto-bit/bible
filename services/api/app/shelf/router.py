"""书架公开 API。"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response

from ..auth.session import get_current_user
from .service import (
    get_platform_asset_path,
    get_platform_book,
    get_platform_file_bytes,
    get_platform_section,
    list_platform_shelf,
)

router = APIRouter(prefix="/shelf", tags=["shelf"])


@router.get("/platform/capabilities")
def shelf_platform_capabilities(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
) -> dict:
    """客户端探测：是否可向合集追加课节（书柜管理员）。"""
    from ..admin.auth import resolve_shelf_admin_actor

    actor = resolve_shelf_admin_actor(
        authorization=authorization,
        x_admin_token=x_admin_token,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    ok = bool(actor)
    return {"shelf_admin": ok, "can_append_collection": ok}


@router.get("/platform")
def shelf_platform_list() -> dict:
    return list_platform_shelf()


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
        ".gif": "image/gif",
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


@router.post("/platform/import")
async def shelf_platform_import(
    file: UploadFile = File(...),
    _user: str = Depends(get_current_user),
) -> dict:
    """用户导入书架书目（docx / md / txt）。"""
    from .ingest import import_platform_file

    suffix = Path(file.filename or "").suffix.lower()
    allowed = {".docx", ".md", ".markdown", ".txt"}
    if suffix not in allowed:
        raise HTTPException(400, "仅支持 .docx .md .txt")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "文件过大（上限 20MB）")
    if len(data) < 16:
        raise HTTPException(400, "文件无效")
    return import_platform_file(
        data,
        filename=file.filename or f"book{suffix}",
        sort_order=9999,
    )
