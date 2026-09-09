"""书架公开 API。"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse, Response

from ..admin.auth import require_shelf_admin, resolve_shelf_admin_actor
from ..auth.session import get_current_user, resolve_user_id
from .service import (
    _book_can_delete,
    _book_can_edit,
    append_collection_lesson,
    collection_units,
    create_user_collection,
    delete_collection_section,
    delete_platform_book,
    get_platform_asset_path,
    get_platform_book,
    get_platform_file_bytes,
    get_platform_section,
    list_platform_shelf,
    update_collection_section,
    update_platform_book,
)


class CreateCollectionBody(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    subtitle: str | None = Field(default=None, max_length=160)


class UpdateBookBody(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    subtitle: str | None = Field(default=None, max_length=160)


class UpdateSectionBody(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    unit: str | None = Field(default=None, max_length=40)

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
    actor_id = resolve_user_id(
        authorization=authorization,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    ok = bool(actor)
    return {
        "shelf_admin": ok,
        "can_append_collection": ok,
        "can_create_collection": bool(actor_id),
    }


def _shelf_actor_context(
    *,
    authorization: str | None,
    x_admin_token: str | None,
    x_user_id: str | None,
    x_user_code: str | None,
    cookie: str | None,
) -> tuple[str | None, bool]:
    actor_id = resolve_user_id(
        authorization=authorization,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    is_admin = bool(
        resolve_shelf_admin_actor(
            authorization=authorization,
            x_admin_token=x_admin_token,
            x_user_id=x_user_id,
            x_user_code=x_user_code,
            cookie=cookie,
        )
    )
    return actor_id, is_admin


@router.post("/platform/collections")
def shelf_platform_create_collection(
    body: CreateCollectionBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    """创建空合集（用户自建，可后续追加资料）。"""
    return create_user_collection(
        title=body.title,
        subtitle=body.subtitle,
        uploaded_by=user_id,
    )


@router.get("/platform/collections/{book_id}/units")
def shelf_platform_collection_units(
    book_id: str,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
) -> dict:
    """合集已有单元列表（所有者或书柜管理员）。"""
    from .service import _collection_book_record, _assert_collection_edit

    rec = _collection_book_record(book_id)
    if not rec:
        raise HTTPException(404, "书目不存在")
    book, source, _ = rec
    actor_id, is_admin = _shelf_actor_context(
        authorization=authorization,
        x_admin_token=x_admin_token,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    _assert_collection_edit(
        book,
        source,
        actor_user_id=actor_id,
        is_shelf_admin=is_admin,
    )
    return {"units": collection_units(book_id)}


@router.post("/platform/collections/{book_id}/lessons")
async def shelf_platform_append_lesson(
    book_id: str,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    unit: str | None = Form(default=None),
    zone: str = Form(default="body"),
    after_section_id: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
) -> dict:
    """向合集追加一份资料（所有者或书柜管理员）。"""
    actor_id, is_admin = _shelf_actor_context(
        authorization=authorization,
        x_admin_token=x_admin_token,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    data = await file.read()
    return append_collection_lesson(
        book_id,
        data=data,
        filename=file.filename or "lesson",
        title=title,
        unit=unit,
        zone=zone,
        after_section_id=after_section_id,
        attachments=None,
        content_type=file.content_type,
        actor_user_id=actor_id,
        is_shelf_admin=is_admin,
    )


@router.get("/platform")
def shelf_platform_list(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
) -> dict:
    actor_id = resolve_user_id(
        authorization=authorization,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    is_admin = bool(
        resolve_shelf_admin_actor(
            authorization=authorization,
            x_admin_token=x_admin_token,
            x_user_id=x_user_id,
            x_user_code=x_user_code,
            cookie=cookie,
        )
    )
    return list_platform_shelf(actor_user_id=actor_id, is_shelf_admin=is_admin)


@router.get("/platform/{book_id}")
def shelf_platform_detail(
    book_id: str,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
) -> dict:
    actor_id, is_admin = _shelf_actor_context(
        authorization=authorization,
        x_admin_token=x_admin_token,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    book = get_platform_book(book_id, include_sections=True)
    book["can_delete"] = _book_can_delete(
        book, actor_user_id=actor_id, is_shelf_admin=is_admin
    )
    book["can_edit"] = _book_can_edit(
        book, actor_user_id=actor_id, is_shelf_admin=is_admin
    )
    return book


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


@router.patch("/platform/books/{book_id}")
def shelf_platform_update_book(
    book_id: str,
    body: UpdateBookBody,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
    user_id: str = Depends(get_current_user),
) -> dict:
    """更新书名/副标题（上传者或书柜管理员）。"""
    is_admin = bool(
        resolve_shelf_admin_actor(
            authorization=authorization,
            x_admin_token=x_admin_token,
            x_user_id=x_user_id,
            x_user_code=x_user_code,
            cookie=cookie,
        )
    )
    return update_platform_book(
        book_id,
        title=body.title,
        subtitle=body.subtitle,
        actor_user_id=user_id,
        is_shelf_admin=is_admin,
    )


@router.patch("/platform/collections/{book_id}/sections/{section_id}")
def shelf_platform_update_section(
    book_id: str,
    section_id: str,
    body: UpdateSectionBody,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
    user_id: str = Depends(get_current_user),
) -> dict:
    """更新合集内资料标题或单元。"""
    actor_id, is_admin = _shelf_actor_context(
        authorization=authorization,
        x_admin_token=x_admin_token,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    return update_collection_section(
        book_id,
        section_id,
        title=body.title,
        unit=body.unit,
        actor_user_id=actor_id,
        is_shelf_admin=is_admin,
    )


@router.delete("/platform/collections/{book_id}/sections/{section_id}")
def shelf_platform_delete_section(
    book_id: str,
    section_id: str,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
    user_id: str = Depends(get_current_user),
) -> dict:
    """从合集移除一份资料。"""
    actor_id, is_admin = _shelf_actor_context(
        authorization=authorization,
        x_admin_token=x_admin_token,
        x_user_id=x_user_id,
        x_user_code=x_user_code,
        cookie=cookie,
    )
    return delete_collection_section(
        book_id,
        section_id,
        actor_user_id=actor_id,
        is_shelf_admin=is_admin,
    )


@router.delete("/platform/books/{book_id}")
def shelf_platform_delete_book(
    book_id: str,
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None),
    x_user_code: str | None = Header(default=None, alias="X-User-Code"),
    cookie: str | None = Header(default=None),
    user_id: str = Depends(get_current_user),
) -> dict:
    """下架并删除书目：书柜管理员可删全部；普通用户仅可删自己导入的书。"""
    is_admin = bool(
        resolve_shelf_admin_actor(
            authorization=authorization,
            x_admin_token=x_admin_token,
            x_user_id=x_user_id,
            x_user_code=x_user_code,
            cookie=cookie,
        )
    )
    return delete_platform_book(book_id, actor_user_id=user_id, is_shelf_admin=is_admin)


@router.post("/platform/import")
async def shelf_platform_import(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
) -> dict:
    """用户导入书架书目（docx / md / txt / pdf）。"""
    from .ingest import import_platform_file

    suffix = Path(file.filename or "").suffix.lower()
    allowed = {".docx", ".md", ".markdown", ".txt", ".pdf"}
    if suffix not in allowed:
        raise HTTPException(400, "仅支持 .docx .md .txt .pdf")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(400, "文件过大（上限 20MB）")
    if len(data) < 16:
        raise HTTPException(400, "文件无效")
    return import_platform_file(
        data,
        filename=file.filename or f"book{suffix}",
        sort_order=9999,
        uploaded_by=user_id,
    )
