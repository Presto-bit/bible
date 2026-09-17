#!/usr/bin/env python3
"""§19.14.15 密图渲染 · journey_spine 竖版 1080×1920

读 knowledge_layout JSON → 写 HTML（字在图内）→ Chrome headless 截 PNG。
ImageMagick SVG 对中文字体不可靠，故用浏览器排版。

用法：
  python3 scripts/render_dense_infographic.py --id paul-first-journey
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
W, H = 1080, 1920
PUBLIC = ROOT / "apps/web/public"

REF_BOOK = {
    "ACT": "使徒行传",
    "EXO": "出埃及记",
    "MAT": "马太福音",
    "MRK": "马可福音",
    "LUK": "路加福音",
    "JHN": "约翰福音",
}

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def format_ref(ref: str | None) -> str:
    if not ref:
        return ""
    parts = ref.replace(".", " ").split()
    if len(parts) < 2:
        return ref
    book = REF_BOOK.get(parts[0].upper(), parts[0])
    if len(parts) >= 3:
        rest = f"{parts[1]}:{parts[2]}"
    else:
        rest = parts[1]
    return f"{book} {rest}"


def resolve_vignette_uri(v: str | None) -> str | None:
    if not v:
        return None
    p = PUBLIC / v.lstrip("/")
    return p.as_uri() if p.is_file() else None


def find_chrome() -> str | None:
    for c in CHROME_CANDIDATES:
        if Path(c).is_file():
            return c
    return shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")


def build_html(layout: dict) -> str:
    title = layout.get("title") or "经文信息图"
    guide = layout.get("guide_one_liner") or ""
    arcs = layout.get("arc") or []
    beats = layout.get("beats") or []

    first_ref = format_ref(beats[0].get("ref") if beats else None)
    last_ref = format_ref(beats[-1].get("ref") if beats else None)
    if first_ref and last_ref and "使徒行传" in first_ref:
        ref_span = "使徒行传 13–14"
    elif first_ref and last_ref and first_ref != last_ref:
        ref_span = f"{first_ref} – {last_ref}"
    else:
        ref_span = first_ref or "经文结构"

    arc_html = "".join(
        f'<span class="arc">{escape(a.get("name") or "")}</span>' for a in arcs
    )

    beat_rows: list[str] = []
    for b in beats:
        order = b.get("order", 0)
        label = escape(b.get("label") or "")
        happen = escape(b.get("happen") or "")
        link = escape(b.get("link") or "")
        ref = escape(format_ref(b.get("ref")))
        vuri = resolve_vignette_uri(b.get("vignette") or None)
        thumb = (
            f'<img class="thumb" src="{vuri}" alt="" />'
            if vuri
            else '<div class="thumb empty"></div>'
        )
        link_html = f'<div class="link">{link}</div>' if link else ""
        ref_html = f'<div class="ref">{ref}</div>' if ref else ""
        beat_rows.append(
            f"""
            <div class="beat">
              <div class="n">{order}</div>
              {thumb}
              <div class="body">
                <div class="label">{label}</div>
                <div class="happen">{happen}</div>
                {link_html}
                {ref_html}
              </div>
            </div>
            """
        )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  html, body {{
    width: {W}px;
    height: {H}px;
    overflow: hidden;
    background: #f7f3ec;
    font-family: "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Noto Sans SC", sans-serif;
    color: #2c2825;
  }}
  .page {{
    width: {W}px;
    height: {H}px;
    padding: 40px 44px 36px;
    border-top: 6px solid #785035;
    display: flex;
    flex-direction: column;
    position: relative;
  }}
  .seal {{
    position: absolute;
    top: 28px;
    right: 28px;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 3px solid #a65a3a;
    color: #a65a3a;
    background: rgba(255,248,232,.94);
    box-shadow: 0 0 0 2px rgba(166,90,58,.22) inset;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    transform: rotate(8deg);
    line-height: 1.15;
    z-index: 2;
  }}
  .seal::before {{
    content: "";
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    border: 1.5px dashed rgba(166,90,58,.55);
  }}
  .seal .seal-brand {{ font-size: 15px; font-weight: 900; letter-spacing: 0.12em; }}
  .seal .seal-sub {{ margin-top: 2px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; }}
  h1 {{
    font-size: 44px;
    font-weight: 600;
    line-height: 1.25;
    margin-bottom: 10px;
    padding-right: 88px;
  }}
  .refspan {{ font-size: 22px; color: #6e675f; margin-bottom: 12px; }}
  .guide {{
    font-size: 26px;
    line-height: 1.4;
    color: #3a3632;
    margin-bottom: 16px;
  }}
  .arcs {{ display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }}
  .arc {{
    border: 1px solid #e5ddd0;
    background: #fff;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 20px;
    color: #5b6b4f;
  }}
  .spine-label {{
    font-size: 22px;
    font-weight: 600;
    color: #785035;
    margin-bottom: 12px;
  }}
  .beats {{
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }}
  .beat {{
    flex: 1;
    display: flex;
    gap: 14px;
    align-items: flex-start;
    background: #fffcf7;
    border: 1px solid #e8dfd2;
    border-radius: 12px;
    padding: 12px 14px;
    min-height: 0;
  }}
  .n {{
    flex: 0 0 36px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #785035;
    color: #f7f3ec;
    font-size: 20px;
    font-weight: 600;
    line-height: 36px;
    text-align: center;
  }}
  .thumb {{
    flex: 0 0 72px;
    width: 72px;
    height: 72px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid #e5ddd0;
    background: #efe8dc;
  }}
  .thumb.empty {{ display: block; }}
  .body {{ flex: 1; min-width: 0; }}
  .label {{ font-size: 26px; font-weight: 600; line-height: 1.25; }}
  .happen {{ font-size: 22px; line-height: 1.35; color: #3a3632; margin-top: 4px; }}
  .link {{ font-size: 18px; color: #8a8278; margin-top: 2px; }}
  .ref {{ font-size: 16px; color: #9a9186; margin-top: 2px; }}
  .footer {{
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e5ddd0;
    font-size: 18px;
    color: #9a9186;
  }}
</style>
</head>
<body>
  <div class="page">
    <div class="seal" aria-label="彼爱手稿">
      <span class="seal-brand">彼爱</span>
      <span class="seal-sub">手稿</span>
    </div>
    <h1>{escape(title)}</h1>
    <div class="refspan">{escape(ref_span)}</div>
    <div class="guide">{escape(guide)}</div>
    <div class="arcs">{arc_html}</div>
    <div class="spine-label">故事脊 · {len(beats)}站</div>
    <div class="beats">
      {''.join(beat_rows)}
    </div>
    <div class="footer">释义说明，仅供参考 · 安静读经，在话语中相遇</div>
  </div>
</body>
</html>
"""


def screenshot_html(chrome: str, html_path: Path, png_path: Path) -> None:
    # Chrome headless screenshot uses window size; device scale 1
    cmd = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={W},{H}",
        f"--screenshot={png_path}",
        html_path.as_uri(),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("layout_json", nargs="?")
    ap.add_argument("--id", help="layout id")
    ap.add_argument("-o", "--out", help="输出 PNG")
    args = ap.parse_args()

    if args.id:
        src = ROOT / "data/knowledge/layouts" / f"{args.id}.json"
    elif args.layout_json:
        src = Path(args.layout_json)
        if not src.is_absolute():
            src = ROOT / src
    else:
        src = ROOT / "data/knowledge/layouts/paul-first-journey.json"

    if not src.is_file():
        print(f"missing layout: {src}", file=sys.stderr)
        return 1

    chrome = find_chrome()
    if not chrome:
        print("Chrome/Chromium required for dense PNG render", file=sys.stderr)
        return 1

    layout = json.loads(src.read_text(encoding="utf-8"))
    layout_id = layout.get("id") or src.stem

    out_dir = ROOT / "data/visual_cards/samples" / f"{layout_id}_dense"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / f"{layout_id}_dense.html"
    png_path = Path(args.out) if args.out else out_dir / f"{layout_id}_dense.png"
    if not png_path.is_absolute():
        png_path = ROOT / png_path

    html_path.write_text(build_html(layout), encoding="utf-8")
    screenshot_html(chrome, html_path, png_path)

    # 规范尺寸
    magick = shutil.which("magick")
    if magick:
        subprocess.run(
            [magick, str(png_path), "-resize", f"{W}x{H}!", str(png_path)],
            check=True,
        )

    public_dir = PUBLIC / "knowledge/infographics"
    public_dir.mkdir(parents=True, exist_ok=True)
    public_png = public_dir / f"{layout_id}.png"
    shutil.copy2(png_path, public_png)

    # 清理旧 SVG（若有）
    old_svg = out_dir / f"{layout_id}_dense.svg"
    if old_svg.exists():
        old_svg.unlink()

    print(f"wrote {html_path}")
    print(f"wrote {png_path}")
    print(f"wrote {public_png}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
