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
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# Mammoth 不保留 run 颜色：注入文本标记，转 HTML 后再还原为 span
_COLOR_MARK_OPEN = "[[c:#"
_COLOR_MARK_MID = "]]"
_COLOR_MARK_CLOSE = "[[/c]]"
_COLOR_SKIP = frozenset({"000000", "FFFFFF", "AUTO", "auto"})

# 无样式 Word：从部标题 / 附录 / 通用章节行启发式切节（禁止裸「1. xxx」）
_PART_HEAD_RE = re.compile(
    r"^第[一二三四五六七八九十百零〇\d]+(?:部|部分|篇|卷)(?:[｜|·\-—:\s　].{0,60})?$"
)
_NUM_ITEM_HEAD_RE = re.compile(r"^\d{1,2}\.\s*.{2,48}$")
_APPENDIX_HEAD_RE = re.compile(r"^附录[一二三四五六七八九十\d｜|].{0,40}$|^附录[｜|].{0,40}$")
_TXT_CHAPTER_RE = re.compile(
    r"^(第[一二三四五六七八九十百零〇\d]+[章节回场部卷篇]\s*.{0,36}|#{1,3}\s+.+)$"
)
_QUESTION_HEAD_RE = re.compile(r"^问题\s*(\d{1,2})$")
_SCENE_DIALOGUE_RE = re.compile(
    r"^第[一二三四五六七八九十百零〇\d]+场(?:对话)?[｜|].{0,48}$"
)
_LESSON_NUM_RE = re.compile(r"^\d{2}\s+\S.{0,60}$")
_CLOSING_HEADS = frozenset(
    {
        "对话结束以后",
        "写给愿意再向前一步的人",
        "教会中常听到的词——简明指南",
    }
)


def _normalize_color_hex(raw: str) -> str | None:
    v = (raw or "").strip().lstrip("#")
    if not v or v.upper() in _COLOR_SKIP:
        return None
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) == 8:
        v = v[:6]
    if len(v) != 6 or any(c not in "0123456789abcdefABCDEF" for c in v):
        return None
    return v.upper()


def _strip_trailing_page_num(text: str) -> str:
    return re.sub(r"\s*\d{1,3}$", "", (text or "").strip()).strip()


def _is_plain_toc_line(text: str) -> bool:
    """目录行：标题后粘页码，如「第一部｜…6」「1.题目7」「01 创造…10」。"""
    t = (text or "").strip()
    if not t or len(t) > 80:
        return False
    if not re.search(r"\d{1,3}$", t):
        return False
    base = _strip_trailing_page_num(t)
    if not base or len(base) < 2:
        return False
    if _is_inferred_body_heading(base):
        return True
    if _NUM_ITEM_HEAD_RE.match(base) or _LESSON_NUM_RE.match(base):
        return True
    # 前言目录项：短标题 + 页码
    if len(base) <= 40 and not re.search(r"[。！？!?]", base):
        return True
    return False


def _is_inferred_body_heading(text: str) -> bool:
    """强模式正文切点：部/部分/场对话/问题 N/附录/第x章；禁裸「1. xxx」。"""
    t = (text or "").strip()
    if not t or len(t) > 60 or len(t) < 2:
        return False
    # 目录胶粘行（多条粘一起）
    if t.count("｜") >= 2 or (t.count("部") >= 1 and t.count("场") >= 1 and "场对话" not in t):
        return False
    if t in _CLOSING_HEADS or t.startswith("附录｜") or t.startswith("附录|"):
        return True
    if _QUESTION_HEAD_RE.match(t):
        return True
    # 正文场标题多为「第N场对话｜」；纯「第N场｜」常见于目录
    if re.match(r"^第[一二三四五六七八九十百零〇\d]+场对话[｜|].{0,48}$", t):
        return True
    if _LESSON_NUM_RE.match(t) and not re.search(r"\d{1,3}$", t):
        return True
    if re.search(r"\d{1,3}$", t) and not re.search(r"[？?。！!）」』]$", t):
        return False
    return bool(
        _PART_HEAD_RE.match(t)
        or _APPENDIX_HEAD_RE.match(t)
        or _TXT_CHAPTER_RE.match(t)
    )



def _is_section_title_style(style: str | None, text: str) -> bool:
    """结构化切节：Heading1，或 Title 且像部/部分标题。不切 Heading2（课内小标题太碎）。"""
    st = style or ""
    t = (text or "").strip()
    if "目录" in t and len(t) <= 8:
        return False
    if st == "Heading1":
        return True
    if st == "TitleCustom" and (_PART_HEAD_RE.match(t) or t in _CLOSING_HEADS):
        return True
    return False


def _extract_plain_front_toc(paras: list[_Para]) -> tuple[list[dict[str, Any]], set[int]]:
    """抽取文前「目录」块为 outline，并返回应跳过的段落 index（不进正文）。"""
    start = -1
    for i, p in enumerate(paras):
        t = (p.text or "").strip()
        if t == "目录" or (t.startswith("目录") and len(t) <= 6) or (
            p.style == "TitleCustom" and t == "目录"
        ):
            start = i
            break
    if start < 0:
        return [], set()

    _toc_end_titles = {
        "致翻开这本书的你",
        "写给翻开这本书的你",
        "写给带着问题阅读的你",
        "写给带着问题读圣经的你",
        "怎样使用这本书",
        "预备洗礼时需要了解的本教会三项追求",
        "三个人物",
        "一起读经时，我们遵循这些原则",
    }

    items: list[dict[str, Any]] = []
    skip: set[int] = {paras[start].index}
    i = start + 1
    while i < len(paras):
        p = paras[i]
        t = (p.text or "").strip()
        if t in _toc_end_titles:
            break
        if _QUESTION_HEAD_RE.match(t):
            break
        # 正文课标题 Heading1「01 …」
        if p.style == "Heading1" and _LESSON_NUM_RE.match(t) and not _is_plain_toc_line(t):
            break
        # 正文部标题：无尾页码的「第N部…」
        if (
            (_PART_HEAD_RE.match(t) or (p.style == "TitleCustom" and "部" in t[:6]))
            and not _is_plain_toc_line(t)
            and t.count("｜") <= 1
            and "场" not in t
        ):
            break
        # 正文场对话
        if re.match(r"^第[一二三四五六七八九十百零〇\d]+场对话[｜|]", t):
            break
        skip.add(p.index)
        if not t:
            i += 1
            continue
        if t.startswith("点击标题") or t.startswith("76个单元"):
            i += 1
            continue
        is_tocish = (
            _is_plain_toc_line(t)
            or ("第" in t[:3] and ("部" in t or "场" in t) and len(t) < 90)
            or (
                len(t) <= 70
                and not re.search(r"[。！？]", t)
                and "陈宇" not in t
                and (p.style in (None, "Heading2", "TOCEntry") or _is_plain_toc_line(t))
            )
        )
        if is_tocish:
            title = _strip_trailing_page_num(t)
            chunks = re.split(
                r"(?=第[一二三四五六七八九十百零〇\d]+(?:部|部分|场))",
                title,
            )
            chunks = [c.strip() for c in chunks if c and c.strip()]
            for ch in chunks or [title]:
                if len(ch) < 2:
                    continue
                zone = _zone_for_title(ch)
                if zone == "meta":
                    continue
                items.append(
                    {
                        "id": f"ft-{len(items)}",
                        "title": ch,
                        "level": 1 if _PART_HEAD_RE.match(ch) else 2,
                        "zone": zone if zone != "meta" else "body",
                        "source": "front_toc",
                        "confidence": 0.85,
                        "section_id": None,
                    }
                )
        i += 1
        if i - start > 220:
            break
    return items, skip



def _inject_color_markers_docx(data: bytes) -> bytes:
    """把带 w:color 的 run 文本包上标记，供 Mammoth 后再还原。"""
    try:
        zin = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return data
    try:
        names = zin.namelist()
        if "word/document.xml" not in names:
            return data
        doc = zin.read("word/document.xml").decode("utf-8", errors="replace")

        def _wrap_run(m: re.Match[str]) -> str:
            run = m.group(0)
            cm = re.search(r'<w:color\b[^>]*w:val="([^"]+)"', run)
            if not cm:
                return run
            hex_v = _normalize_color_hex(cm.group(1))
            if not hex_v:
                return run

            def _wrap_t(tm: re.Match[str]) -> str:
                attrs = tm.group(1) or ""
                body = tm.group(2) or ""
                if not body or _COLOR_MARK_OPEN in body:
                    return tm.group(0)
                marked = f"{_COLOR_MARK_OPEN}{hex_v}{_COLOR_MARK_MID}{body}{_COLOR_MARK_CLOSE}"
                return f"<w:t{attrs}>{marked}</w:t>"

            return re.sub(
                r"<w:t([^>]*)>([\s\S]*?)</w:t>",
                _wrap_t,
                run,
                count=1,
            )

        new_doc = re.sub(r"<w:r\b[^>]*>[\s\S]*?</w:r>", _wrap_run, doc)
        if new_doc == doc:
            return data
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for name in names:
                payload = new_doc.encode("utf-8") if name == "word/document.xml" else zin.read(name)
                zout.writestr(name, payload)
        return out.getvalue()
    finally:
        zin.close()


def _restore_color_markers_html(html_str: str) -> str:
    if _COLOR_MARK_OPEN not in html_str:
        return html_str
    return re.sub(
        re.escape(_COLOR_MARK_OPEN)
        + r"([0-9A-Fa-f]{6})"
        + re.escape(_COLOR_MARK_MID)
        + r"([\s\S]*?)"
        + re.escape(_COLOR_MARK_CLOSE),
        r'<span class="shelf-run-color" style="color:#\1">\2</span>',
        html_str,
    )


@dataclass
class _Para:
    style: str | None
    text: str
    index: int
    # 已转义的段落内 HTML（含 <a class="shelf-ext-link">）；空则回落 text
    inner_html: str = ""


def _load_docx_rels(zf: zipfile.ZipFile) -> dict[str, str]:
    """document.xml.rels → {rId: Target}（仅 External http(s)）。"""
    path = "word/_rels/document.xml.rels"
    if path not in zf.namelist():
        return {}
    try:
        root = ET.fromstring(zf.read(path))
    except ET.ParseError:
        return {}
    out: dict[str, str] = {}
    for rel in root:
        if not rel.tag.endswith("Relationship"):
            continue
        rid = rel.get("Id") or ""
        target = (rel.get("Target") or "").strip()
        mode = (rel.get("TargetMode") or "").strip().lower()
        if not rid or not target:
            continue
        if mode == "external" or target.startswith(("http://", "https://")):
            # Word 可能把 & 写成 &amp;
            target = html.unescape(target)
            out[rid] = target
    return out


def _collect_run_text(el: ET.Element) -> str:
    return "".join(t.text or "" for t in el.iter(f"{W}t"))


def _para_inner_html(p_el: ET.Element, rels: dict[str, str]) -> str:
    """按文档顺序输出段落内文本，并把 w:hyperlink 转成可点外链。"""
    parts: list[str] = []

    def walk(node: ET.Element) -> None:
        tag = node.tag
        if tag == f"{W}hyperlink":
            rid = node.get(f"{R}id") or node.get("id") or ""
            url = rels.get(rid, "")
            text = _collect_run_text(node)
            if not text:
                return
            if url.startswith(("http://", "https://")):
                href = html.escape(url, quote=True)
                parts.append(
                    f'<a href="{href}" class="shelf-ext-link" '
                    f'target="_blank" rel="noopener noreferrer">'
                    f"{html.escape(text)}</a>"
                )
            else:
                parts.append(html.escape(text))
            return
        if tag == f"{W}r":
            # 指令域 HYPERLINK 可能夹在 run 里；普通 run 直接取文本
            instr = "".join(
                (t.text or "") for t in node.iter(f"{W}instrText")
            ).strip()
            if instr.upper().startswith("HYPERLINK"):
                # 域代码本身不输出，可见文字在后续 run / hyperlink
                return
            text = _collect_run_text(node)
            if text:
                parts.append(html.escape(text))
            return
        if tag == f"{W}t":
            # 已在 run/hyperlink 处理
            return
        for child in list(node):
            walk(child)

    walk(p_el)
    if parts:
        return "".join(parts)
    # 回落：无结构化子节点时拼全文
    plain = _collect_run_text(p_el)
    return html.escape(plain) if plain else ""


def _style_name_map(styles_xml: bytes | None) -> dict[str, str]:
    if not styles_xml:
        return {}
    try:
        root = ET.fromstring(styles_xml)
    except ET.ParseError:
        return {}
    out: dict[str, str] = {}
    for s in root.iter(f"{W}style"):
        sid = s.get(f"{W}styleId")
        name_el = s.find(f"{W}name")
        if not sid or name_el is None:
            continue
        name = name_el.get(f"{W}val")
        if name:
            out[sid] = name
    return out


def _canonicalize_style(style_id: str | None, name: str | None) -> str | None:
    """把 styleId / 显示名归一成 Heading1、TitleCustom、TOCEntry 等。"""
    for raw in (name, style_id):
        s = (raw or "").strip()
        if not s:
            continue
        if s in {
            "Heading1",
            "Heading2",
            "Heading3",
            "TOCEntry",
            "TitleCustom",
            "SubtitleCustom",
        }:
            return s
        compact = re.sub(r"[\s_\-]+", "", s).lower()
        m = re.match(r"^(?:heading|标题)(\d)$", compact)
        if m:
            return f"Heading{m.group(1)}"
        if compact in {"title", "标题"}:
            return "TitleCustom"
        if compact in {"subtitle", "副标题"}:
            return "SubtitleCustom"
        # TOC1 / toc 1 / 目录 1 …；排除 "TOC Heading"
        if compact.startswith("toc") and "heading" not in compact and "标题" not in compact:
            return "TOCEntry"
        if compact in {"tocheading", "目录标题"}:
            return "TitleCustom"
    return style_id


def _iter_paragraphs(
    document_xml: bytes,
    *,
    styles_xml: bytes | None = None,
    rels: dict[str, str] | None = None,
) -> list[_Para]:
    name_map = _style_name_map(styles_xml)
    link_rels = rels or {}
    root = ET.fromstring(document_xml)
    out: list[_Para] = []
    for i, p in enumerate(root.iter(f"{W}p")):
        texts = [t.text or "" for t in p.iter(f"{W}t")]
        line = "".join(texts).strip()
        if not line:
            continue
        style_id = None
        p_pr = p.find(f"{W}pPr")
        if p_pr is not None:
            ps = p_pr.find(f"{W}pStyle")
            if ps is not None:
                style_id = ps.get(f"{W}val")
        style = _canonicalize_style(style_id, name_map.get(style_id or ""))
        if link_rels:
            inner = _para_inner_html(p, link_rels)
            if "<a " not in inner:
                inner = html.escape(line)
        else:
            inner = html.escape(line)
        out.append(_Para(style=style, text=line, index=i, inner_html=inner))
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


_DIALOGUE_SPEAKER_RE = re.compile(r"^([\u4e00-\u9fff]{2,4})[：:]\s*(.+)$", re.DOTALL)
_SECTION_KICKERS = frozenset(
    {
        "场景",
        "核心句",
        "一起阅读的经文",
        "继续对话的问题",
        "本章练习",
    }
)
_Q_BLOCK_HEADS = frozenset({"继续对话的问题", "本章练习"})
_PAREN_ASIDE_RE = re.compile(r"^（[^）]{1,120}）$")


def _dialogue_html(text: str, *, inner_html: str | None = None) -> str:
    m = _DIALOGUE_SPEAKER_RE.match(text.strip())
    if not m:
        body = inner_html if inner_html is not None else html.escape(text)
        return f'<p class="shelf-dialogue">{body}</p>'
    speaker, body = m.group(1), m.group(2).strip()
    # 说话人结构优先用纯文本拆分；外链极少出现在说话人行
    return (
        f'<p class="shelf-dialogue">'
        f'<span class="shelf-dialogue-speaker">{html.escape(speaker)}</span>：'
        f'<span class="shelf-dialogue-text">{html.escape(body)}</span></p>'
    )


def _body_html(text: str, *, inner_html: str | None = None) -> str:
    t = (text or "").strip()
    esc = inner_html if inner_html is not None else html.escape(text)
    if t in _Q_BLOCK_HEADS:
        return f'<p class="shelf-dialogue-q-head">{esc}</p>'
    if t in _SECTION_KICKERS:
        return f'<p class="shelf-section-kicker">{esc}</p>'
    if _PAREN_ASIDE_RE.match(t):
        return f'<p class="shelf-aside">{esc}</p>'
    if _DIALOGUE_SPEAKER_RE.match(t) and t.split("：", 1)[0].split(":", 1)[0] not in _SECTION_KICKERS:
        return _dialogue_html(t, inner_html=inner_html)
    return f'<p class="shelf-body">{esc}</p>'


def _para_html(p: _Para) -> str:
    inner = p.inner_html or html.escape(p.text)
    st = p.style or ""
    if st == "TitleCustom":
        return f'<h1 class="shelf-title">{inner}</h1>'
    if st == "SubtitleCustom":
        return f'<p class="shelf-subtitle">{inner}</p>'
    if st.startswith("Heading1") or st == "TOCEntry":
        return f'<h2 class="shelf-h1">{inner}</h2>'
    if st.startswith("Heading2"):
        return f'<h3 class="shelf-h2">{inner}</h3>'
    if st == "Dialogue":
        return _dialogue_html(p.text, inner_html=inner)
    return _body_html(p.text, inner_html=inner)


def _plain_p_text(piece: str) -> str:
    text = re.sub(r"<[^>]+>", "", piece)
    return html.unescape(text).replace("\u00a0", " ").strip()


def _set_p_class(piece: str, cls: str) -> str:
    if re.search(r'\bclass="', piece):
        return re.sub(r'\bclass="[^"]*"', f'class="{cls}"', piece, count=1)
    if re.search(r"\bclass='", piece):
        return re.sub(r"\bclass='[^']*'", f"class='{cls}'", piece, count=1)
    return piece.replace("<p", f'<p class="{cls}"', 1)


def _mark_dialogue_questions(html: str) -> str:
    """继续对话 / 本章练习 标题后的条目标为 shelf-dialogue-q；一起阅读后标 shelf-verse-line。"""
    chunks = html.split("</p>")
    out: list[str] = []
    mode: str | None = None  # "q" | "verse" | None
    for chunk in chunks:
        if not chunk.strip():
            continue
        piece = chunk + "</p>"
        plain = re.sub(r"\s+", "", _plain_p_text(piece))
        if plain in _Q_BLOCK_HEADS:
            out.append(_set_p_class(piece, "shelf-dialogue-q-head"))
            mode = "q"
            continue
        if plain == "一起阅读的经文":
            out.append(_set_p_class(piece, "shelf-section-kicker"))
            mode = "verse"
            continue
        if plain in _SECTION_KICKERS:
            out.append(_set_p_class(piece, "shelf-section-kicker"))
            mode = None
            continue
        if 'class="shelf-docx-h' in piece or 'class="shelf-h' in piece or "shelf-docx-title" in piece:
            mode = None
            out.append(piece)
            continue
        line = _plain_p_text(piece)
        if not line:
            out.append(piece)
            continue
        if mode == "verse":
            out.append(_set_p_class(piece, "shelf-verse-line"))
            mode = None
            continue
        if mode == "q":
            if _DIALOGUE_SPEAKER_RE.match(line):
                mode = None
                out.append(piece)
                continue
            if plain in _SECTION_KICKERS or plain in _Q_BLOCK_HEADS:
                # handled above
                pass
            out.append(_set_p_class(piece, "shelf-dialogue-q"))
            continue
        out.append(piece)
    return "".join(out)


def _enhance_prose_semantics(html_str: str) -> str:
    """无样式 Word：小标题 / 对白 / 经文行 / 练习块语义 class。"""
    if not html_str:
        return html_str
    # 规范化 Word 不换行连字符，便于经文 linkify
    html_str = html_str.replace("\u2011", "-")
    chunks = html_str.split("</p>")
    out: list[str] = []
    for chunk in chunks:
        if not chunk.strip():
            continue
        piece = chunk + "</p>"
        # 已有语义 class 则跳过重标（仍走后续 block 标记）
        if any(
            c in piece
            for c in (
                "shelf-dialogue-q-head",
                "shelf-section-kicker",
                "shelf-verse-line",
                "shelf-aside",
                "shelf-dialogue-speaker",
            )
        ):
            out.append(piece)
            continue
        line = _plain_p_text(piece)
        if not line:
            out.append(piece)
            continue
        if line in _Q_BLOCK_HEADS:
            out.append(_set_p_class(piece, "shelf-dialogue-q-head"))
            continue
        if line in _SECTION_KICKERS:
            out.append(_set_p_class(piece, "shelf-section-kicker"))
            continue
        if _PAREN_ASIDE_RE.match(line):
            out.append(_set_p_class(piece, "shelf-aside"))
            continue
        m = _DIALOGUE_SPEAKER_RE.match(line)
        if m and "shelf-dialogue" not in piece:
            speaker, body = m.group(1), m.group(2).strip()
            out.append(
                f'<p class="shelf-dialogue">'
                f'<span class="shelf-dialogue-speaker">{html.escape(speaker)}</span>：'
                f'<span class="shelf-dialogue-text">{html.escape(body)}</span></p>'
            )
            continue
        out.append(piece)
    merged = "".join(out)
    return _mark_dialogue_questions(merged)


def _normalize_toc_title(title: str) -> str:
    """去页码、部/场前缀与空白，供文前目录与正文标题模糊对齐。"""
    t = (title or "").strip()
    t = re.sub(r"\s*\d{1,3}$", "", t).strip()
    t = re.sub(r"^[\d一二三四五六七八九十百零〇]+[\.、．]\s*", "", t)
    t = re.sub(r"^问题\s*\d+\s*", "", t)
    t = re.sub(r"^第[一二三四五六七八九十百零〇\d]+部[：:｜|]?\s*", "", t)
    t = re.sub(r"^第[一二三四五六七八九十百零〇\d]+场(?:对话)?[：:｜|]?\s*", "", t)
    if "｜" in t or "|" in t:
        t = re.split(r"[｜|]", t, 1)[-1].strip()
    t = re.sub(r"[｜|·\-—:\s　？?！!。．.]+", "", t)
    return t.casefold()


def _match_toc_to_section(toc_title: str, section_title: str) -> bool:
    a = toc_title.strip()
    b = section_title.strip()
    if a == b:
        return True
    if "｜" in a and "｜" in b:
        left_a, right_a = a.split("｜", 1)
        left_b, right_b = b.split("｜", 1)
        if left_a.strip() == left_b.strip():
            return True
        # 文前「第一场」↔ 正文「第一场对话」
        la = re.sub(r"对话$", "", left_a.strip())
        lb = re.sub(r"对话$", "", left_b.strip())
        if la and la == lb:
            return True
        if _normalize_toc_title(right_a) and _normalize_toc_title(right_a) == _normalize_toc_title(
            right_b
        ):
            return True
    na, nb = _normalize_toc_title(a), _normalize_toc_title(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    return na in nb or nb in na


def _link_front_toc_to_sections(
    front_toc: list[dict[str, Any]], sections: list[dict[str, Any]]
) -> None:
    """把文前目录项绑定到已切出的正文节（可在 structured / inferred 之后各跑一次）。"""
    if not front_toc or not sections:
        return
    for ft in front_toc:
        if ft.get("section_id"):
            continue
        for sec in sections:
            if _match_toc_to_section(ft.get("title") or "", sec.get("title") or ""):
                ft["section_id"] = sec["id"]
                break


def _choose_outline(
    front_toc: list[dict[str, Any]],
    toc_body: list[dict[str, Any]],
    suggested_cuts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """读者目录优先用已绑定的文前目录；绑定不足则回落正文 toc，避免「有目录无正文」。"""
    body_outline = [t for t in front_toc if t.get("zone") != "appendix"]
    linked = [t for t in body_outline if t.get("section_id")]
    body_items = [t for t in toc_body if t.get("zone") == "body"]
    if linked and (
        len(linked) >= max(2, int(len(body_outline) * 0.5)) or not body_items
    ):
        return linked
    if body_items:
        return body_items
    if suggested_cuts:
        return [
            {
                "id": c["id"],
                "title": c["title"],
                "level": c.get("level", 1),
                "zone": c.get("zone") or "body",
                "source": "inferred",
                "confidence": c.get("confidence", 0.65),
                "section_id": None,
                "suggested": True,
            }
            for c in suggested_cuts
        ]
    return linked or body_outline


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
        rels = _load_docx_rels(z)
    paras = _iter_paragraphs(doc, rels=rels)
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
            io.BytesIO(_inject_color_markers_docx(data)),
            style_map=style_map,
            convert_image=mammoth.images.img_element(convert_image),
        )
    except Exception:
        return None
    html_str = (result.value or "").strip()
    if not html_str:
        return None
    return _restore_color_markers_html(html_str)


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
        # front matter (preface) is already fully constructed; skip Mammoth override
        if sec.get("kind") == "front":
            continue
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
            _enhance_prose_semantics(
                _mark_dialogue_questions(f'<div class="shelf-docx-root">{matched}</div>')
            )
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
        styles_xml = zf.read("word/styles.xml") if "word/styles.xml" in zf.namelist() else None
        rels = _load_docx_rels(zf)
    paras = _iter_paragraphs(doc_xml, styles_xml=styles_xml, rels=rels)

    title = "未命名"
    subtitle = ""
    for p in paras[:12]:
        if p.style == "TitleCustom":
            title = p.text
        elif p.style == "SubtitleCustom" and not subtitle:
            subtitle = p.text

    plain_front_toc, toc_skip_indexes = _extract_plain_front_toc(paras)

    front_toc: list[dict[str, Any]] = list(plain_front_toc)
    in_toc = False
    for p in paras:
        if p.style and "Heading1" in (p.style or "") and "目录" in p.text:
            in_toc = True
            continue
        if in_toc:
            if p.style == "TOCEntry":
                zone = "appendix" if p.text.strip().startswith("附录") else "body"
                front_toc.append(
                    {
                        "id": f"ft-{len(front_toc)}",
                        "title": _strip_trailing_page_num(p.text),
                        "level": _level_for_style(p.style, p.text),
                        "zone": zone,
                        "source": "front_toc",
                        "confidence": 0.9,
                        "section_id": None,
                    }
                )
                toc_skip_indexes.add(p.index)
            elif p.style and "Heading1" in (p.style or ""):
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
            _enhance_prose_semantics(_mark_dialogue_questions("\n".join(buf)))
        )
        sections.append(current)
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
        if p.index in toc_skip_indexes:
            continue
        if _is_section_title_style(p.style, p.text):
            preface_start = i
            break

    if preface_start > 0:
        preface_html: list[str] = []
        for p in paras[:preface_start]:
            if p.index in toc_skip_indexes or p.style == "TOCEntry":
                continue
            if p.style in ("TitleCustom", "SubtitleCustom") and (
                p.text.strip() == "目录" or ("目录" in p.text and len(p.text) <= 6)
            ):
                continue
            if _is_plain_toc_line(p.text):
                continue
            preface_html.append(_para_html(p))
        while preface_html and not preface_html[0].startswith("<h"):
            preface_html.pop(0)
        for j, h in enumerate(preface_html):
            if ">目录<" in h:
                preface_html = preface_html[:j]
                break
        if preface_html:
            sid = "sec-front"
            raw_preface = f'<div class="shelf-docx-root">{chr(10).join(preface_html)}</div>'
            sections.append(
                {
                    "id": sid,
                    "title": "阅读本书之前",
                    "level": 0,
                    "zone": "front",
                    "source": "structured",
                    "toc_id": "tb-front",
                    "html": inject_shelf_paragraph_anchors(raw_preface),
                    "kind": "front",
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

    structured_hits = 0
    for p in paras[preface_start:]:
        if p.index in toc_skip_indexes or p.style == "TOCEntry":
            continue
        if _is_plain_toc_line(p.text) and p.style != "Heading1":
            continue
        if _is_section_title_style(p.style, p.text):
            flush()
            structured_hits += 1
            current_zone = _zone_for_title(p.text)
            zone = current_zone
            if zone == "meta":
                continue
            sec_id = f"sec-{len(sections)}"
            level = 0 if (p.style == "TitleCustom" and _PART_HEAD_RE.match(p.text.strip())) else 1
            current = {
                "id": sec_id,
                "title": p.text.strip(),
                "level": level,
                "zone": zone,
                "source": "structured",
                "toc_id": f"tb-{len(sections)}",
            }
            buf.append(_para_html(p))
        elif current is not None:
            buf.append(_para_html(p))
    flush()

    if structured_hits < 2:
        sections = []
        toc_body = []

    _link_front_toc_to_sections(front_toc, sections)

    appendix_toc = [t for t in front_toc if t.get("zone") == "appendix"]
    body_outline = [t for t in front_toc if t.get("zone") != "appendix"]

    if enrich and sections:
        try:
            _enrich_sections_with_mammoth(
                data,
                sections,
                book_id=book_id,
                storage_key=storage_key,
            )
        except Exception:
            pass

    suggested_cuts: list[dict[str, Any]] = []
    if not sections and paras:
        heading_idxs: list[tuple[int, str]] = []
        i = 0
        while i < len(paras):
            p = paras[i]
            if p.index in toc_skip_indexes:
                i += 1
                continue
            t = (p.text or "").strip()
            if _QUESTION_HEAD_RE.match(t):
                nxt = ""
                if i + 1 < len(paras):
                    nxt = (paras[i + 1].text or "").strip()
                title_q = f"{t}｜{nxt}" if nxt and len(nxt) <= 60 else t
                heading_idxs.append((i, title_q))
                i += 1
                continue
            if _is_inferred_body_heading(t):
                heading_idxs.append((i, t))
            i += 1

        deduped: list[tuple[int, str]] = []
        seen_norm: set[str] = set()
        for idx, tit in reversed(heading_idxs):
            key = _normalize_toc_title(tit)
            if not key or key in seen_norm:
                continue
            if tit.count("｜") >= 2 and len(tit) > 40:
                continue
            seen_norm.add(key)
            deduped.append((idx, tit))
        heading_idxs = list(reversed(deduped))

        if len(heading_idxs) >= 2:
            for hi, (start, sec_title) in enumerate(heading_idxs):
                zone = _zone_for_title(sec_title.split("｜", 1)[0])
                if zone == "meta":
                    continue
                suggested_cuts.append(
                    {
                        "id": f"cut-{hi}",
                        "title": sec_title,
                        "level": 1,
                        "zone": zone if zone in ("body", "appendix", "front") else "body",
                        "anchor": {"type": "paragraph", "index": start},
                        "confidence": 0.8,
                    }
                )

            first_i = heading_idxs[0][0]
            if first_i > 0:
                pre_bits = [
                    _para_html(p)
                    for p in paras[:first_i]
                    if p.index not in toc_skip_indexes
                    and (p.text or "").strip()
                    and (p.text or "").strip() != "目录"
                    and not _is_plain_toc_line(p.text or "")
                ]
                if pre_bits:
                    sid = "sec-front"
                    raw_preface = f'<div class="shelf-docx-root">{chr(10).join(pre_bits)}</div>'
                    sections.append(
                        {
                            "id": sid,
                            "title": "阅读本书之前",
                            "level": 0,
                            "zone": "front",
                            "source": "inferred",
                            "toc_id": "tb-front",
                            "html": inject_shelf_paragraph_anchors(raw_preface),
                            "kind": "front",
                        }
                    )
                    toc_body.append(
                        {
                            "id": "tb-front",
                            "title": "阅读本书之前",
                            "level": 0,
                            "zone": "front",
                            "source": "inferred",
                            "confidence": 0.75,
                            "section_id": sid,
                        }
                    )
            for hi, (start, sec_title) in enumerate(heading_idxs):
                end = heading_idxs[hi + 1][0] if hi + 1 < len(heading_idxs) else len(paras)
                chunk = [
                    p
                    for p in paras[start:end]
                    if p.index not in toc_skip_indexes and (p.text or "").strip()
                ]
                if not chunk:
                    continue
                bits = [_para_html(p) for p in chunk]
                zone = _zone_for_title(sec_title.split("｜", 1)[0])
                if zone == "meta":
                    continue
                sid = f"sec-{len(sections)}"
                toc_id = f"tb-{len(sections)}"
                wrapped = f'<div class="shelf-docx-root">{chr(10).join(bits)}</div>'
                sections.append(
                    {
                        "id": sid,
                        "title": sec_title,
                        "level": 1,
                        "zone": zone if zone in ("body", "appendix", "front") else "body",
                        "source": "inferred",
                        "toc_id": toc_id,
                        "html": inject_shelf_paragraph_anchors(
                            _enhance_prose_semantics(wrapped)
                        ),
                        "kind": "body",
                    }
                )
                toc_body.append(
                    {
                        "id": toc_id,
                        "title": sec_title,
                        "level": 1,
                        "zone": sections[-1]["zone"],
                        "source": "inferred",
                        "confidence": 0.8,
                        "section_id": sid,
                    }
                )
            if enrich and sections:
                try:
                    _enrich_sections_with_mammoth(
                        data,
                        sections,
                        book_id=book_id,
                        storage_key=storage_key,
                    )
                except Exception:
                    pass
            suggested_cuts = []

        if not sections:
            prose = ""
            try:
                prose = docx_bytes_to_prose_html(
                    data,
                    book_id=book_id,
                    storage_key=storage_key,
                    use_cache=False,
                )
            except Exception:
                prose = ""
            if not (prose or "").strip():
                bits = [
                    _para_html(p)
                    for p in paras
                    if p.index not in toc_skip_indexes
                    and (p.text or "").strip()
                    and not _is_plain_toc_line(p.text or "")
                ]
                if bits:
                    prose = inject_shelf_paragraph_anchors(
                        _enhance_prose_semantics(
                            f'<div class="shelf-docx-root">{chr(10).join(bits)}</div>'
                        )
                    )
            if (prose or "").strip():
                if title == "未命名":
                    for p in paras[:12]:
                        t = (p.text or "").strip()
                        if (
                            t
                            and 1 < len(t) < 80
                            and t != "目录"
                            and not _is_plain_toc_line(t)
                        ):
                            title = t
                            break
                sid = "sec-0"
                sections.append(
                    {
                        "id": sid,
                        "title": "正文",
                        "level": 1,
                        "zone": "body",
                        "source": "plain",
                        "toc_id": "tb-0",
                        "html": prose,
                        "kind": "body",
                    }
                )
                toc_body.append(
                    {
                        "id": "tb-0",
                        "title": "正文",
                        "level": 1,
                        "zone": "body",
                        "source": "plain",
                        "confidence": 0.5,
                        "section_id": sid,
                    }
                )
                if body_outline and not suggested_cuts:
                    for hi, item in enumerate(body_outline):
                        suggested_cuts.append(
                            {
                                "id": f"cut-{hi}",
                                "title": item.get("title") or "",
                                "level": int(item.get("level") or 1),
                                "zone": item.get("zone") or "body",
                                "anchor": {"type": "toc", "index": hi},
                                "confidence": float(item.get("confidence") or 0.7),
                            }
                        )

    # 推断切节在文前目录首次绑定时可能尚未存在，这里补绑一次
    _link_front_toc_to_sections(front_toc, sections)
    body_outline = [t for t in front_toc if t.get("zone") != "appendix"]
    appendix_toc = [t for t in front_toc if t.get("zone") == "appendix"]

    has_structure = any(
        isinstance(s, dict) and s.get("source") in ("structured", "front_toc")
        for s in sections
    )
    has_inferred_multi = len(sections) >= 2 and any(
        isinstance(s, dict) and s.get("source") == "inferred" for s in sections
    )
    plan_source = (
        "heading"
        if has_structure
        else ("inferred" if (suggested_cuts or has_inferred_multi) else "plain")
    )
    plan_confidence = (
        0.95
        if has_structure
        else (0.8 if has_inferred_multi else (0.65 if suggested_cuts else 0.5))
    )
    needs_confirm = bool(suggested_cuts) and not has_structure and not has_inferred_multi
    outline_out = _choose_outline(front_toc, toc_body, suggested_cuts)
    toc_out: dict[str, Any] = {
        "front": [t for t in toc_body if t.get("zone") == "front"],
        "outline": outline_out,
        "body": [t for t in toc_body if t.get("zone") == "body"],
        "appendix": [t for t in toc_body if t.get("zone") == "appendix"] or appendix_toc,
        "plan": {
            "source": plan_source,
            "confidence": plan_confidence,
            "cuts": suggested_cuts,
            "needs_confirm": needs_confirm,
        },
    }
    return {
        "title": _finalize_docx_title(title, paras),
        "subtitle": subtitle,
        "author": None,
        "toc": toc_out,
        "sections": sections,
        "section_count": len(sections),
        "needs_toc_confirm": needs_confirm,
    }



def _finalize_docx_title(title: str, paras: list[_Para]) -> str:
    if title and title != "未命名":
        return title
    for p in paras[:24]:
        t = (p.text or "").strip()
        if not t or t == "目录" or len(t) > 48:
            continue
        if _is_plain_toc_line(t) or _is_inferred_body_heading(t):
            continue
        return t
    return title or "未命名"


def parse_docx_file(path: str | Path) -> dict[str, Any]:
    data = Path(path).read_bytes()
    out = parse_docx_bytes(data)
    out["file_sha256"] = hashlib.sha256(data).hexdigest()
    out["file_size"] = len(data)
    return out


def file_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
