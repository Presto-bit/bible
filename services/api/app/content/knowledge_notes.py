"""运营笔记型 knowledge_layout 落盘（管理员新建 / 草稿 / 媒体上传）。"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile

from . import loader

_SLUG_OK = re.compile(r"[^a-z0-9\-]+")
_ALLOW_IMAGE = {".jpg", ".jpeg", ".png", ".webp"}
_ALLOW_AUDIO = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}
_ALLOW_VIDEO = {".mp4", ".webm", ".mov"}


def note_media_dir() -> Path:
    root = Path(loader._data_dir()) / "knowledge" / "note_media"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _slugify(title: str) -> str:
    raw = (title or "").strip().lower()
    ascii_part = _SLUG_OK.sub("-", raw)
    ascii_part = re.sub(r"-{2,}", "-", ascii_part).strip("-")[:24]
    digest = hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]
    if ascii_part and ascii_part != "-":
        return f"note-{ascii_part}-{digest}"
    return f"note-{digest}"


def _split_body(body: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"\n\s*\n+", body or "") if p.strip()]
    if parts:
        return parts[:12]
    line = (body or "").strip()
    return [line] if line else []


def _layouts_dir() -> Path:
    d = Path(loader._data_dir()) / "knowledge" / "layouts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def build_note_layout(
    *,
    title: str,
    body: str,
    cover_image: str | None = None,
    audio_url: str | None = None,
    video_url: str | None = None,
    note_id: str | None = None,
    status: str = "published",
    folio_pages: list[dict] | None = None,
) -> dict:
    title_s = (title or "").strip()
    if not title_s:
        raise ValueError("标题不能为空")
    paragraphs = _split_body(body)
    # 图/音/视频流可仅有短导语；无正文时用标题顶上
    if not paragraphs:
        if folio_pages or (cover_image or "").strip() or (audio_url or "").strip() or (video_url or "").strip():
            paragraphs = [title_s]
        else:
            raise ValueError("正文不能为空")

    st = (status or "published").strip().lower()
    if st not in ("draft", "published"):
        raise ValueError("status 仅支持 draft / published")

    lid = (note_id or "").strip() or _slugify(title_s)
    lid = lid.replace("..", "").replace("/", "").replace("\\", "")
    if not lid.startswith("note-"):
        lid = f"note-{lid}"

    guide = paragraphs[0]
    if len(guide) > 48:
        guide = guide[:47] + "…"

    media_kinds: list[str] = ["image"]
    page_media = None
    if video_url and video_url.strip():
        media_kinds.append("video")
        page_media = {"type": "video", "url": video_url.strip(), "label": "本页视频"}
    elif audio_url and audio_url.strip():
        media_kinds.append("audio")
        page_media = {"type": "audio", "url": audio_url.strip(), "label": "本页音频"}

    cover = (cover_image or "").strip() or "/knowledge/infographics/_paper_texture.jpg"

    beats = []
    for i, para in enumerate(paragraphs, start=1):
        beat = {
            "order": i,
            "label": f"第 {i} 段" if len(paragraphs) > 1 else "正文",
            "happen": para[:80],
            "note": para,
        }
        if i == 1 and page_media:
            beat["media"] = page_media
        beats.append(beat)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pages = folio_pages
    if not pages:
        pages = [
            {
                "key": "cover",
                "type": "image",
                "src": cover,
                "alt": f"{title_s} · 封面",
                "media": page_media,
            },
            *[
                {
                    "key": f"p{b['order']}",
                    "type": "text",
                    "title": b["label"],
                    "body": b["note"],
                    "alt": f"{title_s} · {b['label']}",
                    "media": b.get("media"),
                }
                for b in beats
            ],
        ]

    return {
        "schema": "knowledge_layout@1",
        "id": lid,
        "kind": "note",
        "status": st,
        "title": title_s,
        "guide_one_liner": guide,
        "body_source": "\n\n".join(paragraphs),
        "generated_at": now,
        "cover_image": cover,
        "media_kinds": media_kinds,
        "density": "concise",
        "source": {"kind": "note", "id": lid},
        "template": "note_folio",
        "blocks": [{"type": "explain_bar", "fields": ["title", "note"]}],
        "beats": beats,
        "folio_pages": pages,
    }


def _rewrite_public_index() -> None:
    layouts_dir = _layouts_dir()
    index_path = layouts_dir / "index.json"
    names: list[str] = []
    for path in sorted(layouts_dir.glob("*.json")):
        if path.name in ("index.json", "schema.json"):
            continue
        try:
            row = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        status = str(row.get("status") or "").lower()
        if status in ("draft", "unpublished"):
            continue
        names.append(path.name)
    # 保留策展行程顺序：先读旧 index 中仍存在的，再补新的
    ordered: list[str] = []
    if index_path.exists():
        try:
            old = json.loads(index_path.read_text(encoding="utf-8"))
            for n in old.get("layouts") or []:
                ns = str(n)
                if ns in names and ns not in ordered:
                    ordered.append(ns)
        except Exception:
            pass
    for n in names:
        if n not in ordered:
            ordered.append(n)
    payload = {
        "schema": "knowledge_layouts_index@1",
        "count": len(ordered),
        "layouts": ordered,
    }
    index_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    loader.knowledge_layouts_index.cache_clear()


def _safe_layout_id(layout_id: str) -> str:
    lid = (layout_id or "").strip().replace("..", "").replace("/", "").replace("\\", "")
    if not lid or lid in ("index", "schema"):
        raise ValueError("无效专题 id")
    return lid


def persist_note_layout(layout: dict) -> dict:
    lid = str(layout.get("id") or "").strip()
    if not lid:
        raise ValueError("缺少 id")
    path = _layouts_dir() / f"{lid}.json"
    path.write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _rewrite_public_index()
    return layout


def list_note_drafts() -> list[dict]:
    out: list[dict] = []
    for path in sorted(_layouts_dir().glob("note-*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            row = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if row.get("status") != "draft":
            continue
        out.append(
            {
                "id": row.get("id"),
                "title": row.get("title"),
                "guide_one_liner": row.get("guide_one_liner"),
                "generated_at": row.get("generated_at"),
                "cover_image": row.get("cover_image"),
                "kind": "note",
                "status": "draft",
                "beat_count": len(row.get("beats") or []),
                "media_kinds": row.get("media_kinds") or ["image"],
            }
        )
    return out


def unpublish_layout(layout_id: str) -> None:
    """下架：标记 unpublished，移出公开列表（文件保留）。"""
    lid = _safe_layout_id(layout_id)
    path = _layouts_dir() / f"{lid}.json"
    if not path.is_file():
        raise FileNotFoundError(lid)
    try:
        row = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise ValueError(f"手稿损坏：{lid}") from e
    if not isinstance(row, dict):
        raise ValueError(f"手稿损坏：{lid}")
    row["status"] = "unpublished"
    path.write_text(json.dumps(row, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _rewrite_public_index()


def delete_layout(layout_id: str) -> None:
    """删除：移除版式 JSON 并更新公开索引（笔记 / 行程均可）。"""
    lid = _safe_layout_id(layout_id)
    path = _layouts_dir() / f"{lid}.json"
    if not path.is_file():
        raise FileNotFoundError(lid)
    path.unlink()
    _rewrite_public_index()


def delete_note_layout(note_id: str) -> None:
    """兼容旧调用：仅允许 note-*。"""
    lid = _safe_layout_id(note_id)
    if not lid.startswith("note-"):
        raise ValueError("只能下架运营笔记（note-*）")
    delete_layout(lid)


async def save_note_media(file: UploadFile, kind: str) -> dict[str, str]:
    kind_s = (kind or "cover").strip().lower()
    suffix = Path(file.filename or "").suffix.lower()
    if kind_s == "cover":
        allow = _ALLOW_IMAGE
        max_bytes = 4 * 1024 * 1024
        label = "图片"
    elif kind_s == "audio":
        allow = _ALLOW_AUDIO
        max_bytes = 20 * 1024 * 1024
        label = "音频"
    elif kind_s == "video":
        allow = _ALLOW_VIDEO
        max_bytes = 40 * 1024 * 1024
        label = "视频"
    else:
        raise HTTPException(status_code=400, detail="kind 仅支持 cover / audio / video")

    if suffix not in allow:
        raise HTTPException(status_code=400, detail=f"{label}格式不支持（{suffix or '无后缀'}）")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="空文件")
    if len(raw) > max_bytes:
        raise HTTPException(status_code=400, detail=f"{label}过大")

    digest = hashlib.sha256(raw).hexdigest()[:16]
    filename = f"{kind_s}-{digest}{suffix}"
    path = note_media_dir() / filename
    path.write_bytes(raw)
    return {"url": f"/content/knowledge-note-media/{filename}", "filename": filename}


def resolve_note_media_path(filename: str) -> Path | None:
    safe = Path(filename).name
    if safe != filename or ".." in filename:
        return None
    path = note_media_dir() / safe
    if not path.is_file():
        return None
    return path
