"""可重排 EPUB → 书架书目（保 DOM + 消毒 CSS；nav/spine 切节）。"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from .html_normalize import inject_shelf_paragraph_anchors
from .image_util import write_optimized_image
from .store import shelf_dir

_CSS_DROP_PROP = re.compile(
    r"^\s*(font-size|font-family|line-height|width|max-width|min-width|"
    r"position|float|column|columns|left|right|top|bottom|color|background|"
    r"margin-left|margin-right|padding-left|padding-right)\b",
    re.I,
)


class EpubError(ValueError):
    pass


def _sanitize_css(css: str) -> str:
    out_rules: list[str] = []
    # 粗切 rule
    for block in re.split(r"}", css):
        if "{" not in block:
            continue
        sel, _, body = block.partition("{")
        sel = sel.strip()
        if not sel or "@" in sel or "keyframes" in sel.lower():
            continue
        kept: list[str] = []
        for decl in body.split(";"):
            decl = decl.strip()
            if not decl or ":" not in decl:
                continue
            prop = decl.split(":", 1)[0].strip().lower()
            if _CSS_DROP_PROP.match(prop):
                continue
            if prop in {
                "font-style",
                "font-weight",
                "font-variant",
                "text-align",
                "border-left",
                "border-right",
                "border-left-width",
                "border-left-style",
                "border-left-color",
                "margin-top",
                "margin-bottom",
                "padding-top",
                "padding-bottom",
            }:
                # 绝对色改成 inherit / 现有 ink
                if "color" in prop and "#" in decl:
                    continue
                kept.append(decl)
            elif prop == "text-indent":
                kept.append(decl)
        if kept:
            out_rules.append(f"{sel} {{ {'; '.join(kept)}; }}")
    return "\n".join(out_rules)


def _strip_dangerous_html(html: str) -> str:
    html = re.sub(r"<(script|iframe|object|embed|form|link|meta)[^>]*>.*?</\1>", "", html, flags=re.I | re.S)
    html = re.sub(r"<(script|iframe|object|embed|form|link|meta)[^>]*/?>", "", html, flags=re.I)
    html = re.sub(r"\son\w+\s*=\s*([\"']).*?\1", "", html, flags=re.I)
    html = re.sub(r"javascript:", "", html, flags=re.I)
    return html


def _is_fixed_layout(opf_xml: bytes) -> bool:
    text = opf_xml.decode("utf-8", errors="replace").lower()
    return "rendition:layout" in text and "pre-paginated" in text


def _detect_drm(namelist: list[str]) -> bool:
    return any("encryption.xml" in n.replace("\\", "/").lower() for n in namelist)


def parse_epub_bytes(
    data: bytes,
    *,
    book_id: str = "",
    storage_key: str = "book.epub",
    title_hint: str | None = None,
) -> dict[str, Any]:
    # DRM / fixed layout via raw zip（先于 ebooklib，避免坏包难定位）
    import io as _io
    import zipfile

    try:
        with zipfile.ZipFile(_io.BytesIO(data)) as zf:
            names = zf.namelist()
            if _detect_drm(names):
                raise EpubError("该 EPUB 含 DRM，无法入库")
            opf = next((n for n in names if n.endswith(".opf")), None)
            if opf and _is_fixed_layout(zf.read(opf)):
                raise EpubError("固定版式 EPUB 暂不支持（请用 PDF 或可重排 EPUB）")
    except EpubError:
        raise
    except zipfile.BadZipFile as e:
        raise EpubError("不是有效的 EPUB（zip）") from e

    try:
        import ebooklib
        from ebooklib import epub
    except ImportError as e:
        raise EpubError("服务端未安装 ebooklib") from e

    try:
        book = epub.read_epub(_io.BytesIO(data))
    except Exception as e:
        raise EpubError(f"无法解析 EPUB：{e}") from e

    title = (title_hint or "").strip()
    if not title:
        md_title = book.get_metadata("DC", "title") or []
        title = md_title[0][0] if md_title else "未命名"
        if isinstance(title, (list, tuple)):
            title = title[0] if title else "未命名"

    author = None
    authors = book.get_metadata("DC", "creator") or []
    if authors:
        author = authors[0][0]

    stem = Path(storage_key).stem or "epub"
    media_dir = shelf_dir()
    media_dir.mkdir(parents=True, exist_ok=True)

    # 收集 CSS
    css_chunks: list[str] = []
    for item in book.get_items_of_type(ebooklib.ITEM_STYLE):
        try:
            css_chunks.append(_sanitize_css(item.get_content().decode("utf-8", errors="replace")))
        except Exception:
            continue
    author_css = "\n".join(c for c in css_chunks if c.strip())

    # spine 文档；nav/toc 标题优先
    spine_ids = [sid for sid, _linear in book.spine]
    id_to_item = {item.get_id(): item for item in book.get_items()}

    nav_titles: dict[str, str] = {}

    def _walk_toc(nodes: Any) -> None:
        for node in nodes or []:
            if isinstance(node, tuple) and len(node) >= 1:
                link = node[0]
                children = node[1] if len(node) > 1 else []
                href = getattr(link, "href", None) or ""
                label = getattr(link, "title", None) or ""
                if href and label:
                    key = unquote(str(href).split("#")[0])
                    nav_titles[key] = str(label).strip()
                    nav_titles[Path(key).name] = str(label).strip()
                _walk_toc(children)
            elif hasattr(node, "href"):
                href = getattr(node, "href", "") or ""
                label = getattr(node, "title", "") or ""
                if href and label:
                    key = unquote(str(href).split("#")[0])
                    nav_titles[key] = str(label).strip()
                    nav_titles[Path(key).name] = str(label).strip()

    try:
        _walk_toc(book.toc)
    except Exception:
        pass

    sections: list[dict[str, Any]] = []
    toc_body: list[dict[str, Any]] = []

    for spine_id in spine_ids:
        item = id_to_item.get(spine_id)
        if item is None or item.get_type() != ebooklib.ITEM_DOCUMENT:
            continue
        raw = item.get_content().decode("utf-8", errors="replace")
        raw = _strip_dangerous_html(raw)
        # 抽 body
        body_m = re.search(r"<body[^>]*>(.*?)</body>", raw, flags=re.I | re.S)
        body = body_m.group(1) if body_m else raw
        # 图片：ebooklib 内嵌
        def _img_repl(m: re.Match[str]) -> str:
            src = m.group(1)
            src_path = unquote(src.split("#")[0])
            # 在 book items 里找
            for im in book.get_items_of_type(ebooklib.ITEM_IMAGE):
                name = im.get_name()
                if name.endswith(src_path) or src_path.endswith(Path(name).name):
                    try:
                        fname, _ = write_optimized_image(
                            im.get_content(),
                            dest_dir=media_dir,
                            stem=stem,
                            content_type=im.media_type or "image/jpeg",
                        )
                        url = f"/shelf/platform/{book_id}/files/{fname}" if book_id else fname
                        return f'<img class="shelf-docx-img" src="{url}" loading="lazy" />'
                    except Exception:
                        break
            return ""

        body = re.sub(
            r'<img[^>]+src=["\']([^"\']+)["\'][^>]*/?>',
            _img_repl,
            body,
            flags=re.I,
        )
        # 标题：nav > 首个 h1-h3 > 文件名
        item_name = item.get_name()
        sec_title = (
            nav_titles.get(item_name)
            or nav_titles.get(Path(item_name).name)
            or ""
        )
        if not sec_title:
            hm = re.search(r"<h[1-3][^>]*>(.*?)</h[1-3]>", body, flags=re.I | re.S)
            sec_title = re.sub(r"<[^>]+>", "", hm.group(1)).strip() if hm else Path(item_name).stem
        if not sec_title:
            sec_title = f"第{len(sections) + 1}节"

        style_tag = f"<style>\n{author_css}\n</style>" if author_css else ""
        wrapped = (
            f'<div class="shelf-epub-root shelf-docx-root">{style_tag}{body}</div>'
        )
        sid = f"sec-{len(sections)}"
        sec = {
            "id": sid,
            "title": sec_title[:80],
            "level": 1,
            "zone": "body",
            "source": "structured",
            "toc_id": f"tb-{len(sections)}",
            "html": inject_shelf_paragraph_anchors(wrapped),
            "kind": "epub",
        }
        sections.append(sec)
        toc_body.append(
            {
                "id": sec["toc_id"],
                "title": sec["title"],
                "level": 1,
                "zone": "body",
                "source": "structured",
                "confidence": 1.0,
                "section_id": sid,
            }
        )

    if not sections:
        raise EpubError("EPUB 无可读章节（spine 为空）")

    return {
        "title": str(title)[:200],
        "subtitle": "",
        "author": author,
        "toc": {
            "front": [],
            "outline": toc_body,
            "body": toc_body,
            "appendix": [],
        },
        "sections": sections,
        "section_count": len(sections),
        "file_sha256": hashlib.sha256(data).hexdigest(),
        "file_size": len(data),
        "needs_toc_confirm": False,
        "variant": "epub",
        "author_css": author_css,
    }


def try_convert_mobi_to_epub(data: bytes, *, filename: str = "book.mobi") -> bytes:
    """若本机有 calibre ebook-convert 则转换，否则抛 EpubError。"""
    import shutil
    import subprocess
    import tempfile

    exe = shutil.which("ebook-convert")
    if not exe:
        raise EpubError("MOBI 需先转为 EPUB（未检测到 calibre ebook-convert）")
    suffix = Path(filename).suffix.lower() or ".mobi"
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / f"in{suffix}"
        dest = Path(td) / "out.epub"
        src.write_bytes(data)
        try:
            subprocess.run(
                [exe, str(src), str(dest)],
                check=True,
                capture_output=True,
                timeout=120,
            )
        except Exception as e:
            raise EpubError(f"MOBI 转换失败：{e}") from e
        if not dest.is_file():
            raise EpubError("MOBI 转换失败：无输出")
        return dest.read_bytes()
