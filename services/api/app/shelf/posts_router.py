"""书架书评 / 笔记 API。"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth.session import get_current_user, try_get_current_user
from ..db import get_pool
from .posts import (
    add_reply,
    create_post,
    delete_post,
    get_post,
    list_posts,
    section_public_notes,
    toggle_like,
    update_post_visibility,
)

router = APIRouter(prefix="/shelf", tags=["shelf-posts"])


class CreateShelfPostBody(BaseModel):
    kind: Literal["review", "note"]
    ref: str
    body: str = Field(min_length=1, max_length=2000)
    abstract: str | None = Field(default=None, max_length=4000)
    visibility: Literal["public", "friends", "private"] = "public"
    section_id: str | None = None
    page_index: int | None = None
    span_start: int | None = None
    span_end: int | None = None
    read_status: Literal["reading", "finished"] | None = None


class UpdateVisibilityBody(BaseModel):
    visibility: Literal["public", "friends", "private"]


class ReplyBody(BaseModel):
    body: str = Field(min_length=1, max_length=500)


@router.get("/platform/{book_id}/posts")
def shelf_list_posts(
    book_id: str,
    kind: Literal["review", "note"] | None = None,
    section_id: str | None = None,
    mine: bool = False,
    sort: Literal["latest", "helpful"] = "latest",
    limit: int = 50,
    offset: int = 0,
    viewer_id: str | None = Depends(try_get_current_user),
) -> dict:
    return list_posts(
        get_pool(),
        book_id,
        kind=kind,
        section_id=section_id,
        viewer_id=viewer_id,
        mine_only=mine,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.get("/platform/{book_id}/posts/section/{section_id}/public-notes")
def shelf_section_public_notes(
    book_id: str,
    section_id: str,
    viewer_id: str | None = Depends(try_get_current_user),
) -> dict:
    return section_public_notes(get_pool(), book_id, section_id, viewer_id)


@router.get("/platform/{book_id}/posts/{post_id}")
def shelf_get_post(
    book_id: str,
    post_id: str,
    viewer_id: str | None = Depends(try_get_current_user),
) -> dict:
    return get_post(get_pool(), book_id, post_id, viewer_id)


@router.post("/platform/{book_id}/posts")
def shelf_create_post(
    book_id: str,
    body: CreateShelfPostBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    return create_post(
        get_pool(),
        book_id,
        user_id,
        kind=body.kind,
        ref=body.ref,
        body=body.body,
        abstract=body.abstract,
        visibility=body.visibility,
        section_id=body.section_id,
        page_index=body.page_index,
        span_start=body.span_start,
        span_end=body.span_end,
        read_status=body.read_status,
    )


@router.patch("/platform/{book_id}/posts/{post_id}/visibility")
def shelf_update_post_visibility(
    book_id: str,
    post_id: str,
    body: UpdateVisibilityBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    return update_post_visibility(
        get_pool(), book_id, post_id, user_id, body.visibility
    )


@router.delete("/platform/{book_id}/posts/{post_id}")
def shelf_delete_post(
    book_id: str,
    post_id: str,
    user_id: str = Depends(get_current_user),
) -> dict:
    return delete_post(get_pool(), book_id, post_id, user_id)


@router.post("/platform/{book_id}/posts/{post_id}/replies")
def shelf_add_reply(
    book_id: str,
    post_id: str,
    body: ReplyBody,
    user_id: str = Depends(get_current_user),
) -> dict:
    return add_reply(get_pool(), book_id, post_id, user_id, body.body)


@router.post("/platform/{book_id}/posts/{post_id}/like")
def shelf_toggle_like(
    book_id: str,
    post_id: str,
    user_id: str = Depends(get_current_user),
) -> dict:
    return toggle_like(get_pool(), book_id, post_id, user_id)
