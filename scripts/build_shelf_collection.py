#!/usr/bin/env python3
"""导入「第一二季度教案」文件夹为平台书架合集（PDF/DOCX + 图片/视频）。"""
from __future__ import annotations

import json
import re
import shutil
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / "data" / "shelf_uploads"
CATALOG = ROOT / "data" / "shelf" / "platform_catalog.json"
BOOK_ID = "00000000-0000-4000-8000-000000000002"

DEFAULT_SRC = Path.home() / "Desktop" / "第一二季度教案"

# (relative path, storage_key, display title, unit or None, zone)
ENTRIES: list[tuple[str, str, str, str | None, str]] = [
    ("第二季度大纲共12期）.pdf", "cur-front-outline.pdf", "第二季度大纲（12 期）", None, "front"),
    ("第二季度家长沟通信.pdf", "cur-front-letter.pdf", "家长沟通信", None, "front"),
    ("第一单元第一周奇妙的光与暗.pdf", "cur-u1-w1.pdf", "第一周 · 奇妙的光与暗", "第一单元", "body"),
    ("第一单元第二周教案蓝蓝的天空与大海.pdf", "cur-u1-w2.pdf", "第二周 · 蓝蓝的天空与大海", "第一单元", "body"),
    ("第一单元第三周教案活泼的生命.pdf", "cur-u1-w3.pdf", "第三周 · 活泼的生命", "第一单元", "body"),
    ("第一单元第四周.pdf", "cur-u1-w4.pdf", "第四周", "第一单元", "body"),
    ("第二单元简要大纲.pdf", "cur-u2-outline.pdf", "单元概要", "第二单元", "body"),
    ("第二单元第一周教案.pdf", "cur-u2-w1.pdf", "第一周 · 奇妙的身体", "第二单元", "body"),
    ("第二单元第二周-独一无二的我.pdf", "cur-u2-w2.pdf", "第二周 · 独一无二的我", "第二单元", "body"),
    ("第二单元第三周——温暖的家（爱的礼物）.pdf", "cur-u2-w3.pdf", "第三周 · 温暖的家", "第二单元", "body"),
    ("第三单元简要大纲.pdf", "cur-u3-outline.pdf", "单元概要", "第三单元", "body"),
    ("第三单元第一周教案.docx", "cur-u3-w1.docx", "第一周", "第三单元", "body"),
    ("第三单元第二课.pdf", "cur-u3-w2.pdf", "第二课", "第三单元", "body"),
    ("第三单元第四周教案 (1).docx", "cur-u3-w4.docx", "第四周", "第三单元", "body"),
    ("第四单元第一期.pdf", "cur-u4-p1.pdf", "第一期", "第四单元", "body"),
    ("第四单元第二期.pdf", "cur-u4-p2.pdf", "第二期", "第四单元", "body"),
    (
        "第四单元第3期：树上的矮个子__品格：接纳不完美的人.pdf",
        "cur-u4-p3.pdf",
        "第三期 · 树上的矮个子",
        "第四单元",
        "body",
    ),
    (
        "第四单元第4期：最温暖的洗脚水__品格：谦卑与服务.pdf",
        "cur-u4-p4.pdf",
        "第四期 · 最温暖的洗脚水",
        "第四单元",
        "body",
    ),
    ("第五单元第一期：平静风浪的指挥官.pdf", "cur-u5-p1.pdf", "第一期 · 平静风浪的指挥官", "第五单元", "body"),
    ("第五单元第二周：黑暗中的光芒.pdf", "cur-u5-w2.pdf", "第二周 · 黑暗中的光芒", "第五单元", "body"),
    ("第五单元第三周教案-守信的牧羊人.pdf", "cur-u5-w3.pdf", "第三周 · 守信的牧羊人", "第五单元", "body"),
    ("第五单元第四周教案：勇敢前行的脚步.pdf", "cur-u5-w4.pdf", "第四周 · 勇敢前行的脚步", "第五单元", "body"),
    ("第六单元第一期.pdf", "cur-u6-p1.pdf", "第一期", "第六单元", "body"),
    ("第六单元第二期.docx", "cur-u6-p2.docx", "第二期", "第六单元", "body"),
    ("第六单元第4期 ：大牧长的小羊群.pdf", "cur-u6-p4.pdf", "第四期 · 大牧长的小羊群", "第六单元", "body"),
    ("打印剪裁人物形象.docx", "cur-appendix-cutout.docx", "打印剪裁人物形象", None, "appendix"),
]

LESSON_U3_L3 = {
    "dir": "第三单元第三课",
    "pdf": ("第三单元第三课.pdf", "cur-u3-l3.pdf"),
    "title": "第三课 · 五饼二鱼",
    "unit": "第三单元",
    "attachments": [
        ("P1.png", "cur-u3-l3-p1.png", "P1", "image"),
        ("P2.png", "cur-u3-l3-p2.png", "P2", "image"),
        ("P3.png", "cur-u3-l3-p3.png", "P3", "image"),
        ("P4.png", "cur-u3-l3-p4.png", "P4", "image"),
        ("P5.png", "cur-u3-l3-p5.png", "P5", "image"),
        ("五饼二鱼的故事.mp4", "cur-u3-l3-story.mp4", "五饼二鱼的故事", "video"),
        ("五饼二鱼手工.mp4", "cur-u3-l3-craft.mp4", "五饼二鱼手工", "video"),
    ],
}

MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".mp4": "video/mp4",
}


def _sec_id(key: str) -> str:
    return f"sec-{Path(key).stem}"


def _copy(src: Path, storage_key: str) -> int:
    dest = UPLOADS / storage_key
    shutil.copy2(src, dest)
    return dest.stat().st_size


def _primary(rel: str, storage_key: str) -> dict:
    ext = Path(storage_key).suffix.lower()
    return {
        "storage_key": storage_key,
        "mime": MIME.get(ext, "application/octet-stream"),
        "title": Path(rel).name,
    }


def main() -> None:
    src_root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_SRC
    if not src_root.is_dir():
        print(f"Folder not found: {src_root}", file=sys.stderr)
        sys.exit(1)

    UPLOADS.mkdir(parents=True, exist_ok=True)
    sections: list[dict] = []
    toc_front: list[dict] = []
    toc_body: list[dict] = []
    toc_appendix: list[dict] = []
    total_size = 0
    current_unit: str | None = None

    def add_unit_header(unit: str) -> None:
        nonlocal current_unit
        if unit == current_unit:
            return
        current_unit = unit
        toc_body.append(
            {
                "id": f"unit-{unit}",
                "title": unit,
                "level": 1,
                "zone": "body",
                "source": "unit",
                "section_id": None,
            }
        )

    for rel, storage_key, title, unit, zone in ENTRIES:
        src = src_root / rel
        if not src.is_file():
            print(f"Skip missing: {rel}", file=sys.stderr)
            continue
        size = _copy(src, storage_key)
        total_size += size
        print(f"  {rel} -> {storage_key}")

        sec_id = _sec_id(storage_key)
        section = {
            "id": sec_id,
            "title": title,
            "zone": zone,
            "level": 2 if unit else 1,
            "kind": "lesson",
            "unit": unit,
            "primary": _primary(rel, storage_key),
            "attachments": [],
        }
        sections.append(section)

        toc_item = {
            "id": f"toc-{sec_id}",
            "title": title,
            "level": 2 if unit else 1,
            "zone": zone,
            "source": "lesson",
            "section_id": sec_id,
        }
        if zone == "front":
            toc_front.append(toc_item)
        elif zone == "appendix":
            toc_appendix.append(toc_item)
        else:
            if unit:
                add_unit_header(unit)
            toc_body.append(toc_item)

    # 第三单元第三课（PDF + 图片 + 视频）
    l3_dir = src_root / LESSON_U3_L3["dir"]
    if l3_dir.is_dir():
        pdf_rel, pdf_key = LESSON_U3_L3["pdf"]
        pdf_src = l3_dir / pdf_rel
        if pdf_src.is_file():
            total_size += _copy(pdf_src, pdf_key)
            attachments: list[dict] = []
            for src_name, att_key, att_title, kind in LESSON_U3_L3["attachments"]:
                att_src = l3_dir / src_name
                if not att_src.is_file():
                    print(f"Skip missing attachment: {src_name}", file=sys.stderr)
                    continue
                total_size += _copy(att_src, att_key)
                ext = Path(att_key).suffix.lower()
                attachments.append(
                    {
                        "id": f"att-{Path(att_key).stem}",
                        "title": att_title,
                        "kind": kind,
                        "storage_key": att_key,
                        "mime": MIME.get(ext, "application/octet-stream"),
                    }
                )
            sec_id = _sec_id(pdf_key)
            add_unit_header(LESSON_U3_L3["unit"])
            l3_section = {
                "id": sec_id,
                "title": LESSON_U3_L3["title"],
                "zone": "body",
                "level": 2,
                "kind": "lesson",
                "unit": LESSON_U3_L3["unit"],
                "primary": _primary(pdf_rel, pdf_key),
                "attachments": attachments,
            }
            w4_id = _sec_id("cur-u3-w4")
            insert_sec = next((i for i, s in enumerate(sections) if s["id"] == w4_id), None)
            if insert_sec is not None:
                sections.insert(insert_sec, l3_section)
            else:
                sections.append(l3_section)
            # 插在第三单元第四周之前：按 w2 之后插入
            insert_at = None
            for i, item in enumerate(toc_body):
                if item.get("section_id") == _sec_id("cur-u3-w4"):
                    insert_at = i
                    break
            l3_toc = {
                "id": f"toc-{sec_id}",
                "title": LESSON_U3_L3["title"],
                "level": 2,
                "zone": "body",
                "source": "lesson",
                "section_id": sec_id,
            }
            if insert_at is not None:
                toc_body.insert(insert_at, l3_toc)
            else:
                toc_body.append(l3_toc)
            print(f"  {LESSON_U3_L3['dir']}/ -> {pdf_key} + {len(attachments)} attachments")

    book = {
        "id": BOOK_ID,
        "book_type": "collection",
        "title": "幼儿教案 · 第一二季度",
        "subtitle": "第一～第六单元",
        "author": "",
        "mime": "application/collection+json",
        "storage_key": sections[0]["primary"]["storage_key"] if sections else "",
        "file_size": total_size,
        "file_sha256": None,
        "status": "published",
        "sort_order": 90,
        "toc": {
            "front": toc_front,
            "body": toc_body,
            "appendix": toc_appendix,
        },
        "sections": sections,
    }

    items: list[dict] = []
    groups = None
    if CATALOG.is_file():
        raw = json.loads(CATALOG.read_text(encoding="utf-8"))
        items = [i for i in (raw.get("items") or []) if i.get("id") != BOOK_ID]
        groups = raw.get("groups")
    items.append(book)
    if not book.get("group_id"):
        book["group_id"] = "curriculum"
    items.sort(key=lambda b: int(b.get("sort_order") or 0), reverse=True)

    out_doc: dict = {"items": items}
    if groups:
        out_doc["groups"] = groups

    CATALOG.parent.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps(out_doc, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nBuilt collection shelf book:")
    print(f"  title: {book['title']}")
    print(f"  sections: {len(sections)}")
    print(f"  total_size: {total_size / 1024 / 1024:.1f} MB")
    print(f"  catalog: {CATALOG}")


if __name__ == "__main__":
    main()
