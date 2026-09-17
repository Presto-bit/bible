#!/usr/bin/env python3
"""把行程手稿栅格烘焙成保罗同款竖版（1080×1920）+ WebP。

- 旷野：横图贴到纸感竖版上（密图册可满屏）
- 加利利：纸感竖版 + 站名/happen/经文摘录（无 AI 密图时先可滑）

依赖本机 ImageMagick `magick` 与 `cwebp`。
"""

from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INFRA = ROOT / "apps/web/public/knowledge/infographics"
PAPER = INFRA / "_paper_texture.jpg"
W = 1080
H = 1920
FONT = "/System/Library/Fonts/Supplemental/Songti.ttc"


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def to_webp(png: Path, q: int = 78) -> None:
    webp = png.with_suffix(".webp")
    run(["cwebp", "-quiet", "-q", str(q), str(png), "-o", str(webp)])
    print("webp", webp.name, webp.stat().st_size)


def portrait_from_landscape(src: Path, dest: Path) -> None:
    run(
        [
            "magick",
            str(PAPER),
            "-resize",
            f"{W}x{H}!",
            "(",
            str(src),
            "-resize",
            f"{W}x",
            ")",
            "-gravity",
            "north",
            "-geometry",
            "+0+120",
            "-compose",
            "over",
            "-composite",
            str(dest),
        ]
    )


def text_folio_page(
    dest: Path,
    *,
    brand: str,
    title: str,
    happen: str,
    verse: str,
    order_label: str,
) -> None:
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        base = td_path / "base.png"
        run(
            [
                "magick",
                str(PAPER),
                "-resize",
                f"{W}x{H}!",
                "-fill",
                "rgba(44,36,22,0.06)",
                "-draw",
                f"rectangle 56,72 {W - 56},{H - 72}",
                str(base),
            ]
        )
        # 标题区
        title_img = td_path / "title.png"
        run(
            [
                "magick",
                "-background",
                "none",
                "-font",
                FONT,
                "-fill",
                "#5c4f3a",
                "-pointsize",
                "26",
                f"label:{brand}",
                "-fill",
                "#8a7a62",
                "-pointsize",
                "22",
                f"label:{order_label}",
                "-fill",
                "#2c2416",
                "-pointsize",
                "48",
                f"label:{title}",
                "-gravity",
                "west",
                "-smush",
                "18",
                str(title_img),
            ]
        )
        body_bits = []
        if happen.strip():
            happen_img = td_path / "happen.png"
            run(
                [
                    "magick",
                    "-background",
                    "none",
                    "-font",
                    FONT,
                    "-fill",
                    "#3d3428",
                    "-pointsize",
                    "32",
                    "-size",
                    f"{W - 160}x",
                    f"caption:{happen.strip()}",
                    str(happen_img),
                ]
            )
            body_bits.append(str(happen_img))
        if verse.strip():
            verse_img = td_path / "verse.png"
            run(
                [
                    "magick",
                    "-background",
                    "none",
                    "-font",
                    FONT,
                    "-fill",
                    "#5c4f3a",
                    "-pointsize",
                    "26",
                    "-size",
                    f"{W - 160}x",
                    f"caption:{verse.strip()}",
                    str(verse_img),
                ]
            )
            body_bits.append(str(verse_img))

        cmd = [
            "magick",
            str(base),
            str(title_img),
            "-geometry",
            "+72+120",
            "-compose",
            "over",
            "-composite",
        ]
        y = 360
        for bit in body_bits:
            cmd += [bit, "-geometry", f"+72+{y}", "-compose", "over", "-composite"]
            # 粗估下一块间距
            y += 220
        cmd.append(str(dest))
        run(cmd)


def bake_wilderness() -> None:
    samples = ROOT / "data/visual_cards/samples/exodus_wilderness_v311"
    mapping = [
        ("00_overview.png", "exodus-wilderness-comic.png"),
        ("00_overview.png", "exodus-wilderness.png"),
        ("00_overview.png", "exodus-wilderness-s01.png"),
        ("01_red_sea.png", "exodus-wilderness-s02.png"),
        ("02_marah.png", "exodus-wilderness-s03.png"),
        ("03_elim.png", "exodus-wilderness-s04.png"),
        ("05_rephidim.png", "exodus-wilderness-s05.png"),
        ("06_sinai.png", "exodus-wilderness-s06.png"),
    ]
    for src_name, dest_name in mapping:
        src = samples / src_name
        dest = INFRA / dest_name
        if not src.exists():
            raise SystemExit(f"missing {src}")
        portrait_from_landscape(src, dest)
        to_webp(dest)
        print("wrote", dest.name, dest.stat().st_size)


def bake_galilee() -> None:
    layout_path = ROOT / "data/knowledge/layouts/jesus-ministry-galilee.json"
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    title = layout.get("title") or "耶稣加利利事工"
    guide = layout.get("guide_one_liner") or ""

    overview = INFRA / "jesus-ministry-galilee-comic.png"
    text_folio_page(
        overview,
        brand="彼爱手稿",
        title=title,
        happen=guide,
        verse="",
        order_label="行程总览",
    )
    to_webp(overview)
    print("wrote", overview.name)

    for b in layout.get("beats") or []:
        order = int(b.get("order") or 0)
        if order <= 0:
            continue
        dest = INFRA / f"jesus-ministry-galilee-s{order:02d}.png"
        ref = (b.get("ref") or "").strip()
        text_folio_page(
            dest,
            brand="彼爱手稿",
            title=str(b.get("label") or f"第 {order} 站"),
            happen=str(b.get("happen") or b.get("note") or ""),
            verse=str(b.get("verse_excerpt") or ""),
            order_label=f"第 {order} 站" + (f" · {ref}" if ref else ""),
        )
        to_webp(dest)
        print("wrote", dest.name)

    # 走密图册路径
    layout["cover_image"] = "/knowledge/infographics/jesus-ministry-galilee-comic.png"
    layout_path.write_text(
        json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("updated cover_image → comic")


def main() -> None:
    if not PAPER.exists():
        raise SystemExit(f"missing paper {PAPER}")
    bake_wilderness()
    bake_galilee()


if __name__ == "__main__":
    main()
