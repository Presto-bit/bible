"""DOCX 解析：标题样式 + 文前 TOCEntry + 正文 Heading 分区。"""
from __future__ import annotations

import hashlib
import html
import io
import re
import zipfile
from dataclasses import dataclass

from .html_normalize import inject_shelf_paragraph_anchors
from .store import shelf_dir
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


@dataclass
class _Para:
    style: str | None
    text: str
    index: int


def _iter_paragraphs(document_xml: bytes) -> list[_Para]:
    root = ET.fromstring(document_xml)
    out: list[_Para] = []
    for i, p in enumerate(root.iter(f"{W}p")):
        texts = [t.text or "" for t in p.iter(f"{W}t")]
        line = "".join(texts).strip()
        if not line:
            continue
        style = None
        p_pr = p.find(f"{W}pPr")
        if p_pr is not None:
            ps = p_pr.find(f"{W}pStyle")
            if ps is not None:
                style = ps.get(f"{W}val")
        out.append(_Para(style=style, text=line, index=i))
    return out


def _zone_for_title(title: str) -> str:
    t = title.strip()
    if t.startswith("附录") or t.startswith("Appendix"):
        return "appendix"
    if "目录" in t and len(t) <= 8:
        return "meta"
    return "body"


def _level_for_style(style: str | None, title: str) -> int:
    s = style or ""
    if s == "TOCEntry":
        return 2 if "｜" in title or "附录" in title else 1
    if "Heading2" in s or s.endswith("2"):
        return 2
    if "Heading3" in s or s.endswith("3"):
        return 3
    return 1


def _source_for_style(style: str | None) -> str:
    if style == "TOCEntry":
        return "front_toc"
    if style and "Heading" in style:
        return "structured"
    return "inferred"


_DIALOGUE_SPEAKER_RE = re.compile(r"^(信徒|牧者)[：:]\s*(.*)$", re.DOTALL)


def _dialogue_html(text: str) -> str:
    m = _DIALOGUE_SPEAKER_RE.match(text.strip())
    if not m:
        return f'<p class="shelf-dialogue">{html.escape(text)}</p>'
    speaker, body = m.group(1), m.group(2)
    return (
        f'<p class="shelf-dialogue">'
        f'<span class="shelf-dialogue-speaker">{html.escape(speaker)}</span>：'
        f'<span class="shelf-dialogue-text">{html.escape(body)}</span></p>'
    )


def _body_html(text: str) -> str:
    esc = html.escape(text)
    if text.strip() == "继续对话的问题":
        return f'<p class="shelf-dialogue-q-head">{esc}</p>'
    return f'<p class="shelf-body">{esc}</p>'


def _para_html(p: _Para) -> str:
    esc = html.escape(p.text)
    st = p.style or ""
    if st == "TitleCustom":
        return f'<h1 class="shelf-title">{esc}</h1>'
    if st == "SubtitleCustom":
        return f'<p class="shelf-subtitle">{esc}</p>'
    if st.startswith("Heading1") or st == "TOCEntry":
        return f'<h2 class="shelf-h1">{esc}</h2>'
    if st.startswith("Heading2"):
        return f'<h3 class="shelf-h2">{esc}</h3>'
    if st == "Dialogue":
        return _dialogue_html(p.text)
    return _body_html(p.text)


def _mark_dialogue_questions(html: str) -> str:
    chunks = html.split("</p>")
    out: list[str] = []
    in_q = False
    for chunk in chunks:
        if not chunk.strip():
            continue
        piece = chunk + "</p>"
        if 'class="shelf-dialogue-q-head"' in piece:
            in_q = True
            out.append(piece)
            continue
        if in_q and 'class="shelf-body"' in piece:
            out.append(piece.replace('class="shelf-body"', 'class="shelf-dialogue-q"', 1))
            continue
        if in_q:
            in_q = False
        out.append(piece)
    return "".join(out)


def _match_toc_to_section(toc_title: str, section_title: str) -> bool:
    a = toc_title.strip()
    b = section_title.strip()
    if a == b:
        return True
    if "｜" in a and "｜" in b:
        return a.split("｜", 1)[0] == b.split("｜", 1)[0]
    return False


_SHELF_DOCX_STYLE_MAP = """
p[style-name='Title'] => h1.shelf-docx-title:fresh
p[style-name='标题'] => h1.shelf-docx-title:fresh
p[style-name='Heading 1'] => h2.shelf-docx-h1:fresh
p[style-name='Heading 2'] => h3.shelf-docx-h2:fresh
p[style-name='Heading 3'] => h4.shelf-docx-h3:fresh
p[style-name='标题 1'] => h2.shelf-docx-h1:fresh
p[style-name='标题 2'] => h3.shelf-docx-h2:fresh
p[style-name='标题 3'] => h4.shelf-docx-h3:fresh
p[style-name='Normal'] => p.shelf-docx-p:fresh
p[style-name='正文'] => p.shelf-docx-p:fresh
p[style-name='Body Text'] => p.shelf-docx-p:fresh
p[style-name='List Paragraph'] => p.shelf-docx-p:fresh
p[style-name='列表段落'] => p.shelf-docx-p:fresh
p[style-name='Quote'] => blockquote.shelf-docx-quote:fresh
p[style-name='引用'] => blockquote.shelf-docx-quote:fresh
r[style-name='Strong'] => strong
r[style-name='Emphasis'] => em
"""

_SHELF_BOOK_STYLE_MAP = """
p[style-name='TitleCustom'] => h1.shelf-title:fresh
p[style-name='SubtitleCustom'] => p.shelf-subtitle:fresh
p[style-name='Heading1Custom'] => h2.shelf-h1:fresh
p[style-name='Heading2Custom'] => h3.shelf-h2:fresh
p[style-name='Dialogue'] => p.shelf-dialogue:fresh
p[style-name='Scene'] => p.shelf-body:fresh
p[style-name='Reflection'] => p.shelf-dialogue-q:fresh
p[style-name='ReflectionTitle'] => p.shelf-dialogue-q-head:fresh
p[style-name='BodyNoIndent'] => p.shelf-body:fresh
p[style-name='Reference'] => p.shelf-body:fresh
p[style-name='TOCEntry'] => p.shelf-toc-skip:fresh
p[style-name='Title'] => h1.shelf-title:fresh
p[style-name='Subtitle'] => p.shelf-subtitle:fresh
p[style-name='Heading 1'] => h2.shelf-h1:fresh
p[style-name='Heading 2'] => h3.shelf-h2:fresh
"""

_MIME_EXT = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
}

_P_BLOCK_RE = re.compile(r"<p\b([^>]*)>(.*?)</p>", re.IGNORECASE | re.DOTALL)
_BR_SPLIT_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_SINGLE_OL_RE = re.compile(r"<ol>\s*<li>(.*?)</li>\s*</ol>", re.IGNORECASE | re.DOTALL)
_CN_H2_RE = re.compile(r"^[一二三四五六七八九十]+、\S")
_CN_H3_RE = re.compile(r"^[（(][一二三四五六七八九十]+[）)]")
_IMG_SPLIT_RE = re.compile(r"(<img\b[^>]*>)", re.IGNORECASE)


def _safe_stem(storage_key: str) -> str:
    stem = Path(storage_key).stem or "docx"
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "-", stem).strip("-")
    return (cleaned[:80] if cleaned else "docx")


def _plain_frag(html_fragment: str) -> str:
    text = re.sub(r"<[^>]+>", "", html_fragment)
    text = html.unescape(text).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _block_for_fragment(frag: str) -> str:
    frag = frag.strip()
    if not frag:
        return ""
    plain = _plain_frag(frag)
    inner = re.sub(r"</?strong>", "", frag, flags=re.IGNORECASE).strip()
    if _CN_H2_RE.match(plain) and len(plain) <= 40:
        return f"<h2>{inner}</h2>"
    if _CN_H3_RE.match(plain) and len(plain) <= 80:
        return f"<h3>{frag}</h3>"
    return f"<p>{frag}</p>"


def _unwrap_heading_lists(html_str: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        inner = m.group(1).strip()
        plain = _plain_frag(inner)
        if 0 < len(plain) <= 24 and not any(ch in plain for ch in "。；;，,"):
            return f"<h2>{inner}</h2>"
        return m.group(0)

    return _SINGLE_OL_RE.sub(_repl, html_str)


def _split_br_and_promote(html_str: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        body = m.group(2)
        parts = _BR_SPLIT_RE.split(body)
        if len(parts) == 1:
            return _block_for_fragment(body) or m.group(0)
        blocks = [_block_for_fragment(part) for part in parts]
        return "\n".join(b for b in blocks if b)

    return _P_BLOCK_RE.sub(_repl, html_str)


def _promote_first_title(html_str: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        body = m.group(2)
        plain = _plain_frag(body)
        if plain and len(plain) <= 80 and (
            len(plain) <= 40 or "教案" in plain or plain.startswith("第")
        ):
            return f"<h1>{body}</h1>"
        return m.group(0)

    return _P_BLOCK_RE.sub(_repl, html_str, count=1)


def _explode_inline_images(html_str: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        body = m.group(2)
        if len(_IMG_SPLIT_RE.findall(body)) < 2:
            return m.group(0)
        parts = _IMG_SPLIT_RE.split(body)
        out: list[str] = []
        buf: list[str] = []
        for part in parts:
            if part.lower().startswith("<img"):
                text = "".join(buf).strip()
                if text:
                    out.append(f"<p>{text}</p>")
                buf = []
                out.append(f"<p>{part}</p>")
            else:
                buf.append(part)
        text = "".join(buf).strip()
        if text:
            out.append(f"<p>{text}</p>")
        return "\n".join(out) or m.group(0)

    return _P_BLOCK_RE.sub(_repl, html_str)


def _wrap_trailing_gallery(html_str: str) -> str:
    """文末「图片：」后的连续插图收成图库，便于点开浏览。"""
    marker = re.search(
        r"(<p[^>]*>\s*(?:<strong>)?图片：?(?:</strong>)?\s*</p>)((?:\s*<p[^>]*>\s*<img\b[^>]*>\s*</p>)+)",
        html_str,
        flags=re.IGNORECASE,
    )
    if not marker:
        # 同一段「图片：」已被 explode 成标题段 + 图段
        marker = re.search(
            r"(<p[^>]*>\s*图片：?\s*</p>)((?:\s*<p[^>]*>\s*<img\b[^>]*>\s*</p>)+)",
            html_str,
            flags=re.IGNORECASE,
        )
    if not marker:
        return html_str
    head, imgs = marker.group(1), marker.group(2)
    gallery = (
        f'{head}<div class="shelf-docx-gallery" data-shelf-gallery="1">'
        f"{imgs}</div>"
    )
    return html_str[: marker.start()] + gallery + html_str[marker.end() :]


def _ensure_img_attrs(html_str: str) -> str:
    def _img(m: re.Match[str]) -> str:
        tag = m.group(0)
        if "loading=" not in tag.lower():
            tag = tag.replace("<img", '<img loading="lazy"', 1)
        if "shelf-docx-img" not in tag:
            if re.search(r'\bclass=["\']', tag, flags=re.I):
                tag = re.sub(
                    r'\bclass=(["\'])',
                    r'class=\1shelf-docx-img ',
                    tag,
                    count=1,
                    flags=re.I,
                )
            else:
                tag = tag.replace("<img", '<img class="shelf-docx-img"', 1)
        return tag

    return re.sub(r"<img\b[^>]*>", _img, html_str, flags=re.I)


def _refine_lesson_html(html_str: str) -> str:
    out = _unwrap_heading_lists(html_str)
    out = _split_br_and_promote(out)
    out = _promote_first_title(out)
    out = _explode_inline_images(out)
    out = _wrap_trailing_gallery(out)
    out = _ensure_img_attrs(out)
    return f'<div class="shelf-docx-root">{out}</div>'


def _text_only_prose_html(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        doc = z.read("word/document.xml")
    paras = _iter_paragraphs(doc)
    if not paras:
        return '<p class="shelf-body muted">（空文档）</p>'
    return inject_shelf_paragraph_anchors("\n".join(_para_html(p) for p in paras))


def _mammoth_to_html(
    data: bytes,
    *,
    book_id: str,
    storage_key: str,
    media_dir: Path,
    style_map: str = _SHELF_DOCX_STYLE_MAP,
) -> str | None:
    try:
        import mammoth
    except ImportError:
        return None
    from .image_util import clean_image_alt, write_optimized_image

    stem = _safe_stem(storage_key)
    dest_dir = media_dir
    dest_dir.mkdir(parents=True, exist_ok=True)

    def convert_image(image: Any) -> dict[str, str]:
        with image.open() as fh:
            raw = fh.read()
        mime = (getattr(image, "content_type", None) or "image/png").split(";")[0].strip().lower()
        name, _ = write_optimized_image(raw, dest_dir=dest_dir, stem=stem, content_type=mime)
        src = f"/shelf/platform/{book_id}/files/{name}" if book_id else name
        alt = clean_image_alt(getattr(image, "alt_text", None))
        return {"src": src, "alt": alt, "loading": "lazy"}

    try:
        result = mammoth.convert_to_html(
            io.BytesIO(data),
            style_map=style_map,
            convert_image=mammoth.images.img_element(convert_image),
        )
    except Exception:
        return None
    html_str = (result.value or "").strip()
    return html_str or None


def _split_mammoth_book_html(html_str: str) -> list[tuple[str, str]]:
    """按 h2.shelf-h1 切成 (title, section_html)。"""
    parts = re.split(r'(<h2 class="shelf-h1">.*?</h2>)', html_str, flags=re.IGNORECASE | re.DOTALL)
    if len(parts) <= 1:
        return [("", html_str)]
    out: list[tuple[str, str]] = []
    preface = parts[0].strip()
    if preface:
        out.append(("阅读本书之前", preface))
    i = 1
    while i + 1 < len(parts):
        heading = parts[i]
        body = parts[i + 1]
        title = _plain_frag(heading)
        if title == "目录":
            i += 2
            continue
        chunk = re.sub(
            r'<p class="shelf-toc-skip">.*?</p>',
            "",
            heading + body,
            flags=re.IGNORECASE | re.DOTALL,
        )
        out.append((title, chunk.strip()))
        i += 2
    return out


def _enrich_sections_with_mammoth(
    data: bytes,
    sections: list[dict[str, Any]],
    *,
    book_id: str = "",
    storage_key: str = "book.docx",
) -> None:
    """用 Mammoth 富 HTML 覆盖节内纯文本（对话书）。"""
    rich = _mammoth_to_html(
        data,
        book_id=book_id or "book",
        storage_key=storage_key,
        media_dir=shelf_dir(),
        style_map=_SHELF_BOOK_STYLE_MAP,
    )
    if not rich:
        return
    chunks = _split_mammoth_book_html(rich)
    if not chunks:
        return
    for sec in sections:
        title = str(sec.get("title") or "")
        matched = None
        for ct, html_chunk in chunks:
            if _match_toc_to_section(ct, title) or ct == title:
                matched = html_chunk
                break
        if not matched:
            continue
        # 无 class 的 p 补 shelf-body，便于对话样式
        matched = re.sub(
            r"<p>(?!</p>)",
            '<p class="shelf-body">',
            matched,
        )
        matched = re.sub(
            r'<p class="shelf-toc-skip">.*?</p>',
            "",
            matched,
            flags=re.IGNORECASE | re.DOTALL,
        )
        sec["html"] = inject_shelf_paragraph_anchors(
            _mark_dialogue_questions(f'<div class="shelf-docx-root">{matched}</div>')
        )


def docx_bytes_to_prose_html(
    data: bytes,
    *,
    book_id: str = "",
    storage_key: str = "",
    media_dir: Path | None = None,
    use_cache: bool = True,
) -> str:
    """单份 DOCX → 书架阅读 HTML（教案 primary 等）。保留图片 / 换行 / 列表。"""
    from .convert_cache import read_html_cache, write_html_cache

    sha = file_sha256(data) if use_cache else ""
    if use_cache and sha:
        cached = read_html_cache(sha)
        if cached:
            return cached
    html_str = _mammoth_to_html(
        data,
        book_id=book_id,
        storage_key=storage_key,
        media_dir=media_dir if media_dir is not None else shelf_dir(),
    )
    if html_str:
        out = _refine_lesson_html(html_str)
    else:
        out = _text_only_prose_html(data)
    if use_cache and sha and out:
        write_html_cache(sha, out)
    return out


def parse_docx_bytes(
    data: bytes,
    *,
    book_id: str = "",
    storage_key: str = "book.docx",
    enrich: bool = True,
) -> dict[str, Any]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        doc_xml = zf.read("word/document.xml")
    paras = _iter_paragraphs(doc_xml)

    title = "未命名"
    subtitle = ""
    for p in paras[:12]:
        if p.style == "TitleCustom":
            title = p.text
        elif p.style == "SubtitleCustom" and not subtitle:
            subtitle = p.text

    front_toc: list[dict[str, Any]] = []
    in_toc = False
    for p in paras:
        if p.style and "Heading1" in p.style and "目录" in p.text:
            in_toc = True
            continue
        if in_toc:
            if p.style == "TOCEntry":
                zone = "appendix" if p.text.strip().startswith("附录") else "body"
                front_toc.append(
                    {
                        "id": f"ft-{len(front_toc)}",
                        "title": p.text,
                        "level": _level_for_style(p.style, p.text),
                        "zone": zone,
                        "source": "front_toc",
                        "confidence": 0.9,
                        "section_id": None,
                    }
                )
            elif p.style and "Heading1" in p.style:
                break

    sections: list[dict[str, Any]] = []
    toc_body: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    buf: list[str] = []
    current_zone = "body"

    def flush() -> None:
        nonlocal current, buf
        if current is None:
            return
        current["html"] = inject_shelf_paragraph_anchors(
            _mark_dialogue_questions("\n".join(buf))
        )
        sections.append(current)
        # 目录只保留一级标题（二十场对话 + 三个附录），附录内经文/第几天不入目录
        if current["level"] <= 1:
            toc_body.append(
                {
                    "id": current["toc_id"],
                    "title": current["title"],
                    "level": current["level"],
                    "zone": current["zone"],
                    "source": current["source"],
                    "confidence": 1.0 if current["source"] == "structured" else 0.75,
                    "section_id": current["id"],
                }
            )
        current = None
        buf = []

    preface_start = 0
    for i, p in enumerate(paras):
        if p.style and "Heading1" in p.style and "目录" not in p.text:
            if "对话" in p.text or p.text.startswith("第"):
                preface_start = i
                break

    if preface_start > 0:
        preface_html: list[str] = []
        for p in paras[:preface_start]:
            if p.style == "TOCEntry":
                continue
            if p.style in ("TitleCustom", "SubtitleCustom"):
                continue
            preface_html.append(_para_html(p))
        if preface_html:
            sid = "sec-front"
            sections.append(
                {
                    "id": sid,
                    "title": "阅读本书之前",
                    "level": 0,
                    "zone": "front",
                    "source": "structured",
                    "toc_id": "tb-front",
                    "html": "\n".join(preface_html),
                }
            )
            toc_body.insert(
                0,
                {
                    "id": "tb-front",
                    "title": "阅读本书之前",
                    "level": 0,
                    "zone": "front",
                    "source": "structured",
                    "confidence": 1.0,
                    "section_id": sid,
                },
            )

    for p in paras[preface_start:]:
        if p.style == "TOCEntry":
            continue
        is_h1 = p.style and "Heading1" in p.style and "目录" not in p.text
        is_h2 = p.style and "Heading2" in p.style
        if is_h1 or is_h2:
            flush()
            if is_h1:
                current_zone = _zone_for_title(p.text)
                zone = current_zone
            else:
                zone = current_zone
            if zone == "meta":
                continue
            sec_id = f"sec-{len(sections)}"
            current = {
                "id": sec_id,
                "title": p.text,
                "level": 1 if is_h1 else 2,
                "zone": zone,
                "source": _source_for_style(p.style),
                "toc_id": f"tb-{len(sections)}",
            }
            buf.append(_para_html(p))
        elif current is not None:
            buf.append(_para_html(p))
    flush()

    for ft in front_toc:
        for sec in sections:
            if _match_toc_to_section(ft["title"], sec["title"]):
                ft["section_id"] = sec["id"]
                break

    appendix_toc = [t for t in front_toc if t.get("zone") == "appendix"]
    body_outline = [t for t in front_toc if t.get("zone") != "appendix"]

    if enrich:
        try:
            _enrich_sections_with_mammoth(
                data,
                sections,
                book_id=book_id,
                storage_key=storage_key,
            )
        except Exception:
            pass

    return {
        "title": title,
        "subtitle": subtitle,
        "author": None,
        "toc": {
            "front": [t for t in toc_body if t.get("zone") == "front"],
            "outline": body_outline,
            "body": [t for t in toc_body if t.get("zone") == "body"],
            "appendix": [t for t in toc_body if t.get("zone") == "appendix"]
            or appendix_toc,
        },
        "sections": sections,
        "section_count": len(sections),
    }


def parse_docx_file(path: str | Path) -> dict[str, Any]:
    data = Path(path).read_bytes()
    out = parse_docx_bytes(data)
    out["file_sha256"] = hashlib.sha256(data).hexdigest()
    out["file_size"] = len(data)
    return out


def file_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
