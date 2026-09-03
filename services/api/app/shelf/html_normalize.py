"""书架 HTML 归一：去 Word 内联样式、统一 class、注入段落锚点。"""
from __future__ import annotations

import re
from html import unescape

_STRIP_STYLE_KEYS = (
    "font-size",
    "font-family",
    "line-height",
    "color",
    "letter-spacing",
    "mso-",
)

_LAYOUT_STYLE_KEYS = {
    "margin-left",
    "margin-right",
    "margin-top",
    "margin-bottom",
    "margin",
    "padding-left",
    "padding-right",
    "padding-top",
    "padding-bottom",
    "padding",
    "width",
    "max-width",
    "min-width",
    "text-indent",
    "left",
    "right",
    "top",
    "float",
    "position",
}

_P_RE = re.compile(r"<p\b([^>]*)>(.*?)</p>", re.IGNORECASE | re.DOTALL)
_H_RE = {
    1: re.compile(r"<h1\b([^>]*)>(.*?)</h1>", re.IGNORECASE | re.DOTALL),
    2: re.compile(r"<h2\b([^>]*)>(.*?)</h2>", re.IGNORECASE | re.DOTALL),
    3: re.compile(r"<h3\b([^>]*)>(.*?)</h3>", re.IGNORECASE | re.DOTALL),
    4: re.compile(r"<h4\b([^>]*)>(.*?)</h4>", re.IGNORECASE | re.DOTALL),
}
_STYLE_RE = re.compile(r'\sstyle="([^"]*)"', re.IGNORECASE)
_CLASS_RE = re.compile(r'\sclass="([^"]*)"', re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")


def _strip_inline_style(style: str) -> str:
    parts = []
    for part in style.split(";"):
        part = part.strip()
        if not part:
            continue
        key = part.split(":")[0].strip().lower()
        if any(key.startswith(k) for k in _STRIP_STYLE_KEYS):
            continue
        if key in _LAYOUT_STYLE_KEYS:
            continue
        parts.append(part)
    return "; ".join(parts)


def _clean_tag_attrs(attrs: str) -> str:
    out = attrs or ""

    def _style_sub(m: re.Match[str]) -> str:
        cleaned = _strip_inline_style(m.group(1))
        return f' style="{cleaned}"' if cleaned else ""

    out = _STYLE_RE.sub(_style_sub, out)
    out = re.sub(r'\s(?:width|height|align|valign)="[^"]*"', "", out, flags=re.IGNORECASE)
    return out


def _normalize_img_tag(attrs: str) -> str:
    cleaned = _clean_tag_attrs(attrs).rstrip().rstrip("/").rstrip()
    return f'<img class="shelf-docx-img"{cleaned} />'


def _flatten_simple_divs(html: str) -> str:
    """Word/Mammoth 常包一层带 margin 的 div，展平为段落以便满宽排版。"""
    block_inside = re.compile(r"<\s*(table|ul|ol|h[1-4]|blockquote|img)\b", re.I)
    div_re = re.compile(r"<div\b([^>]*)>(.*?)</div>", re.IGNORECASE | re.DOTALL)
    out = html
    for _ in range(32):
        changed = False

        def _repl(m: re.Match[str]) -> str:
            nonlocal changed
            attrs = m.group(1) or ""
            if (
                "shelf-docx-table-wrap" in attrs
                or "shelf-docx-root" in attrs
                or "shelf-docx-gallery" in attrs
                or "shelf-epub-root" in attrs
            ):
                return m.group(0)
            body = m.group(2).strip()
            if not body:
                changed = True
                return ""
            if block_inside.search(body):
                return m.group(0)
            changed = True
            if "shelf-docx-" in body:
                return body
            return f'<p class="shelf-docx-p">{body}</p>'

        out2 = div_re.sub(_repl, out)
        if out2 == out:
            break
        out = out2
    return out


def _plain_len(html_fragment: str) -> int:
    text = _TAG_RE.sub("", html_fragment)
    text = unescape(text).replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return len(text)


def inject_shelf_paragraph_anchors(html: str) -> str:
    """为 shelf-body / shelf-docx-p 段落注入 data-shelf-p 索引。"""
    if not html.strip():
        return html
    idx = 0

    def _inject_p(m: re.Match[str]) -> str:
        nonlocal idx
        attrs = m.group(1) or ""
        body = m.group(2)
        if 'data-shelf-p="' in attrs:
            return m.group(0)
        cls_m = _CLASS_RE.search(attrs)
        classes = cls_m.group(1) if cls_m else ""
        is_body = "shelf-body" in classes or "shelf-docx-p" in classes or "shelf-dialogue" in classes
        if not is_body and _plain_len(body) == 0:
            return m.group(0)
        if "shelf-body" not in classes and "shelf-docx-p" not in classes and _plain_len(body) > 0:
            if not cls_m:
                attrs += ' class="shelf-body"'
            elif "shelf-body" not in classes and "shelf-docx-p" not in classes:
                attrs = _CLASS_RE.sub(f' class="{classes} shelf-body"', attrs, count=1)
        anchor = f' data-shelf-p="{idx}"'
        idx += 1
        attrs = _clean_tag_attrs(attrs)
        return f"<p{attrs}{anchor}>{body}</p>"

    return _P_RE.sub(_inject_p, html)


def normalize_docx_html(raw: str, *, lesson: bool = False) -> str:
    """Mammoth / Word HTML → 书架 docx 类名（对齐 Web adaptShelfDocxHtml）。"""
    if not raw.strip():
        return raw
    out = raw
    out = re.sub(r'class="shelf-body"', 'class="shelf-docx-p"', out)
    out = re.sub(r"class='shelf-body'", "class='shelf-docx-p'", out)
    out = re.sub(
        r"<table\b",
        r'<div class="shelf-docx-table-wrap"><table class="shelf-docx-table"',
        out,
        flags=re.IGNORECASE,
    )
    out = out.replace("</table>", "</table></div>")
    out = re.sub(
        r"<img\b([^>]*)/?>",
        lambda m: _normalize_img_tag(m.group(1) or ""),
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(r"<ul\b", r'<ul class="shelf-docx-list"', out, flags=re.IGNORECASE)
    out = re.sub(r"<ol\b", r'<ol class="shelf-docx-list"', out, flags=re.IGNORECASE)
    out = re.sub(
        r'<p\b(?![^>]*class=)([^>]*)>',
        r'<p class="shelf-docx-p"\1>',
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"<h1\b(?![^>]*class=)",
        r'<h1 class="shelf-docx-title"',
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"<h2\b(?![^>]*class=)",
        r'<h2 class="shelf-docx-h1"',
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"<h3\b(?![^>]*class=)",
        r'<h3 class="shelf-docx-h2"',
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"<h4\b(?![^>]*class=)",
        r'<h4 class="shelf-docx-h3"',
        out,
        flags=re.IGNORECASE,
    )
    out = re.sub(
        r"<blockquote\b(?![^>]*class=)",
        r'<blockquote class="shelf-docx-quote"',
        out,
        flags=re.IGNORECASE,
    )
    out = _flatten_simple_divs(out)
    out = _STYLE_RE.sub(
        lambda m: (f' style="{c}"' if (c := _strip_inline_style(m.group(1))) else ""),
        out,
    )
    _ = lesson
    return inject_shelf_paragraph_anchors(out)


def normalize_section_html(html: str, *, kind: str = "html", lesson: bool = False) -> str:
    if not html.strip():
        return html
    if kind == "lesson" or "shelf-docx-" in html:
        return normalize_docx_html(html, lesson=lesson)
    return inject_shelf_paragraph_anchors(html)
