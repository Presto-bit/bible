"""DOCX 解析：标题样式 + 文前 TOCEntry + 正文 Heading 分区。"""
from __future__ import annotations

import hashlib
import html
import io
import zipfile
from dataclasses import dataclass
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
    return f'<p class="shelf-body">{esc}</p>


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


def docx_bytes_to_prose_html(data: bytes) -> str:
    """单份 DOCX → 书架阅读 HTML（教案 primary 等）。"""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        doc = z.read("word/document.xml")
    paras = _iter_paragraphs(doc)
    if not paras:
        return '<p class="shelf-body muted">（空文档）</p>'
    return "\n".join(_para_html(p) for p in paras)


def parse_docx_bytes(data: bytes) -> dict[str, Any]:
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
        current["html"] = _mark_dialogue_questions("\n".join(buf))
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
