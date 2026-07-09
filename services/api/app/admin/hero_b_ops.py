"""Hero B 运营活动：CRUD、上传、活动选取。"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, UploadFile

from ..content.hero_b_link import HeroBLinkError, resolve_hero_b_href
from ..db import get_pool

logger = logging.getLogger(__name__)

CHINA = ZoneInfo("Asia/Shanghai")
_ALLOWED_IMAGE_SUFFIX = {".jpg", ".jpeg", ".png", ".webp"}
_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def hero_b_assets_dir() -> Path:
    # services/api/data/hero_b_assets
    root = Path(__file__).resolve().parents[2] / "data" / "hero_b_assets"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _row_to_dict(row: tuple) -> dict[str, Any]:
    (
        cid,
        name,
        enabled,
        status,
        priority,
        start_at,
        end_at,
        image_url,
        image_url_dark,
        image_version,
        alt,
        badge,
        link_json,
        href,
        audience,
        created_at,
        updated_at,
    ) = row
    link = link_json if isinstance(link_json, dict) else json.loads(link_json or "{}")
    return {
        "id": cid,
        "name": name,
        "enabled": bool(enabled),
        "status": status,
        "priority": int(priority),
        "startAt": start_at.astimezone(CHINA).isoformat(),
        "endAt": end_at.astimezone(CHINA).isoformat(),
        "imageUrl": image_url,
        "imageUrlDark": image_url_dark,
        "imageVersion": int(image_version),
        "alt": alt,
        "badge": badge,
        "link": link,
        "href": href,
        "audience": audience,
        "createdAt": created_at.isoformat() if created_at else None,
        "updatedAt": updated_at.isoformat() if updated_at else None,
    }


def _public_campaign(row: dict[str, Any]) -> dict[str, Any]:
    v = int(row.get("imageVersion") or 1)
    base = row["imageUrl"]
    sep = "&" if "?" in base else "?"
    image_url = f"{base}{sep}v={v}"
    dark = row.get("imageUrlDark")
    image_url_dark = None
    if dark:
        sep_d = "&" if "?" in dark else "?"
        image_url_dark = f"{dark}{sep_d}v={v}"
    out: dict[str, Any] = {
        "id": row["id"],
        "imageUrl": image_url,
        "alt": row["alt"],
        "href": row["href"],
    }
    if row.get("badge"):
        out["badge"] = row["badge"]
    if image_url_dark:
        out["imageUrlDark"] = image_url_dark
    return out


def _parse_dt(value: str) -> datetime:
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise HTTPException(status_code=400, detail="时间格式无效") from e
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CHINA)
    return dt.astimezone(timezone.utc)


def validate_campaign_body(body: dict[str, Any], *, require_id: bool) -> dict[str, Any]:
    cid = str(body.get("id") or "").strip()
    if require_id and not _ID_RE.match(cid):
        raise HTTPException(status_code=400, detail="id 需为小写字母数字与 -_")
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="请填写活动名称")
    image_url = str(body.get("imageUrl") or "").strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="请上传活动主图")
    alt = str(body.get("alt") or "").strip()
    if len(alt) < 4:
        raise HTTPException(status_code=400, detail="alt 至少 4 个字符")
    link = body.get("link")
    if not isinstance(link, dict):
        raise HTTPException(status_code=400, detail="link 无效")
    try:
        href = resolve_hero_b_href(link)
    except HeroBLinkError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    status = str(body.get("status") or "draft")
    if status not in ("draft", "published"):
        raise HTTPException(status_code=400, detail="status 无效")
    audience = str(body.get("audience") or "all")
    if audience not in ("all", "admin_preview"):
        raise HTTPException(status_code=400, detail="audience 无效")
    return {
        "id": cid,
        "name": name,
        "enabled": bool(body.get("enabled", True)),
        "status": status,
        "priority": int(body.get("priority") or 0),
        "startAt": _parse_dt(str(body["startAt"])),
        "endAt": _parse_dt(str(body["endAt"])),
        "imageUrl": image_url,
        "imageUrlDark": (str(body["imageUrlDark"]).strip() if body.get("imageUrlDark") else None),
        "imageVersion": int(body.get("imageVersion") or 1),
        "alt": alt,
        "badge": (str(body["badge"]).strip()[:6] if body.get("badge") else None),
        "link": link,
        "href": href,
        "audience": audience,
    }


def list_campaigns() -> list[dict[str, Any]]:
    pool = get_pool()
    with pool.connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, enabled, status, priority, start_at, end_at,
                   image_url, image_url_dark, image_version, alt, badge,
                   link_json, href, audience, created_at, updated_at
            FROM hero_b_campaign
            ORDER BY priority DESC, start_at DESC
            """,
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_campaign(campaign_id: str) -> dict[str, Any] | None:
    pool = get_pool()
    with pool.connection() as conn:
        row = conn.execute(
            """
            SELECT id, name, enabled, status, priority, start_at, end_at,
                   image_url, image_url_dark, image_version, alt, badge,
                   link_json, href, audience, created_at, updated_at
            FROM hero_b_campaign WHERE id = %s
            """,
            (campaign_id,),
        ).fetchone()
    return _row_to_dict(row) if row else None


def upsert_campaign(body: dict[str, Any], *, is_new: bool) -> dict[str, Any]:
    data = validate_campaign_body(body, require_id=is_new)
    pool = get_pool()
    with pool.connection() as conn:
        if is_new:
            exists = conn.execute(
                "SELECT 1 FROM hero_b_campaign WHERE id = %s",
                (data["id"],),
            ).fetchone()
            if exists:
                raise HTTPException(status_code=409, detail="活动 id 已存在")
            conn.execute(
                """
                INSERT INTO hero_b_campaign (
                  id, name, enabled, status, priority, start_at, end_at,
                  image_url, image_url_dark, image_version, alt, badge,
                  link_json, href, audience
                ) VALUES (
                  %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s,
                  %s::jsonb, %s, %s
                )
                """,
                (
                    data["id"],
                    data["name"],
                    data["enabled"],
                    data["status"],
                    data["priority"],
                    data["startAt"],
                    data["endAt"],
                    data["imageUrl"],
                    data["imageUrlDark"],
                    data["imageVersion"],
                    data["alt"],
                    data["badge"],
                    json.dumps(data["link"], ensure_ascii=False),
                    data["href"],
                    data["audience"],
                ),
            )
        else:
            conn.execute(
                """
                UPDATE hero_b_campaign SET
                  name = %s, enabled = %s, status = %s, priority = %s,
                  start_at = %s, end_at = %s,
                  image_url = %s, image_url_dark = %s, image_version = %s,
                  alt = %s, badge = %s, link_json = %s::jsonb, href = %s,
                  audience = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (
                    data["name"],
                    data["enabled"],
                    data["status"],
                    data["priority"],
                    data["startAt"],
                    data["endAt"],
                    data["imageUrl"],
                    data["imageUrlDark"],
                    data["imageVersion"],
                    data["alt"],
                    data["badge"],
                    json.dumps(data["link"], ensure_ascii=False),
                    data["href"],
                    data["audience"],
                    data["id"],
                ),
            )
        conn.commit()
    saved = get_campaign(data["id"])
    if not saved:
        raise HTTPException(status_code=500, detail="保存失败")
    return saved


def delete_campaign(campaign_id: str) -> None:
    pool = get_pool()
    with pool.connection() as conn:
        conn.execute("DELETE FROM hero_b_campaign WHERE id = %s", (campaign_id,))
        conn.commit()


async def upload_hero_image(file: UploadFile, campaign_id: str | None = None) -> dict[str, str]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOW_IMAGE_SUFFIX:
        raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP")
    raw = await file.read()
    if len(raw) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片不能超过 2MB")
    digest = hashlib.sha256(raw).hexdigest()[:12]
    prefix = campaign_id if campaign_id and _ID_RE.match(campaign_id) else "asset"
    filename = f"{prefix}-{digest}{suffix}"
    path = hero_b_assets_dir() / filename
    path.write_bytes(raw)
    return {"imageUrl": f"/content/hero-b/assets/{filename}"}


def pick_active_campaign(
    *,
    admin_preview: bool = False,
    preview_campaign_id: str | None = None,
) -> dict[str, Any] | None:
    try:
        return _pick_active_campaign(admin_preview=admin_preview, preview_campaign_id=preview_campaign_id)
    except Exception:
        logger.exception("pick_active_campaign failed")
        return None


def _pick_active_campaign(
    *,
    admin_preview: bool = False,
    preview_campaign_id: str | None = None,
) -> dict[str, Any] | None:
    pool = get_pool()
    now = datetime.now(timezone.utc)
    with pool.connection() as conn:
        if preview_campaign_id and admin_preview:
            row = conn.execute(
                """
                SELECT id, name, enabled, status, priority, start_at, end_at,
                       image_url, image_url_dark, image_version, alt, badge,
                       link_json, href, audience, created_at, updated_at
                FROM hero_b_campaign WHERE id = %s
                """,
                (preview_campaign_id,),
            ).fetchone()
            if row:
                return _public_campaign(_row_to_dict(row))
            return None

        rows = conn.execute(
            """
            SELECT id, name, enabled, status, priority, start_at, end_at,
                   image_url, image_url_dark, image_version, alt, badge,
                   link_json, href, audience, created_at, updated_at
            FROM hero_b_campaign
            WHERE enabled = TRUE
              AND status = 'published'
              AND start_at <= %s
              AND end_at >= %s
            ORDER BY priority DESC, updated_at DESC
            LIMIT 20
            """,
            (now, now),
        ).fetchall()

    for row in rows:
        item = _row_to_dict(row)
        audience = item.get("audience") or "all"
        if audience == "admin_preview" and not admin_preview:
            continue
        if audience == "all" or (audience == "admin_preview" and admin_preview):
            return _public_campaign(item)
    return None
