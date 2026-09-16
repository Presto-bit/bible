#!/usr/bin/env python3
"""从 knowledge_layout@1 渲染「知识信息页」HTML（§19.14.12/13）。

对齐 NotebookLM 的是版式密度，不是让生图模型烤中文海报：
  路径 SVG + 叙事弧 + 多格（图下短标）+ 经文锚点 + 讲解条。

用法：
  python scripts/render_knowledge_infographic.py paul-first-journey
  python scripts/render_knowledge_infographic.py exodus-wilderness --open
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAYOUT_DIR = ROOT / "data" / "knowledge" / "layouts"
OUT_DIR = ROOT / "data" / "visual_cards" / "samples" / "knowledge_infographic"
# 母题图：优先仓库内 public vignettes（相对 HTML 的路径需可在 file:// 下打开）
PUBLIC_VIGNETTE = ROOT / "apps" / "web" / "public" / "knowledge" / "vignettes"


def load_layout(layout_id: str) -> dict:
    path = LAYOUT_DIR / f"{layout_id}.json"
    if not path.exists():
        raise SystemExit(f"missing layout: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def vignette_href(v: str) -> str:
    """layout 里是 /knowledge/vignettes/... → 复制到 out/art 或用相对 symlink 路径。"""
    if not v:
        return ""
    # strip leading slash
    rel = v.lstrip("/")
    # apps/web/public/knowledge/vignettes/...
    if rel.startswith("knowledge/"):
        src = ROOT / "apps" / "web" / "public" / rel
    else:
        src = ROOT / "apps" / "web" / "public" / "knowledge" / "vignettes" / Path(v).name
    return str(src) if src.exists() else ""


def copy_art(layout: dict, art_dir: Path) -> dict[str, str]:
    """复制 vignette 到 art/，返回 order->相对路径。"""
    import shutil

    art_dir.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    for b in layout.get("beats") or []:
        v = (b.get("vignette") or "").strip()
        if not v:
            continue
        src_rel = v.lstrip("/")
        src = ROOT / "apps" / "web" / "public" / src_rel
        if not src.exists():
            continue
        name = f"{int(b['order']):02d}_{b.get('place_id') or b.get('label')}.png"
        dst = art_dir / name
        shutil.copy2(src, dst)
        mapping[str(b["order"])] = f"art/{name}"
    return mapping


def path_svg(layout: dict, active_order: int = 1) -> str:
    """简易示意路径（站序均匀排布）；站名由 SVG 矢量字出。"""
    beats = layout.get("beats") or []
    n = max(len(beats), 1)
    w, h = 640, 220
    pts = []
    for i, b in enumerate(beats):
        t = i / max(n - 1, 1)
        x = 48 + t * (w - 96)
        # 轻微起伏，避免一条直线
        y = 110 + (18 if i % 2 else -18)
        pts.append((x, y, b))
    poly = " ".join(f"{x:.1f},{y:.1f}" for x, y, _ in pts)
    dots = []
    for x, y, b in pts:
        on = int(b.get("order") or 0) == active_order
        fill = "#5b6b4f" if on else "#785035"
        label = (b.get("label") or "")[:6]
        dots.append(
            f'<g transform="translate({x:.1f},{y:.1f})">'
            f'<circle r="12" fill="{fill}" stroke="#f7f3ec" stroke-width="2"/>'
            f'<text y="1" fill="#f7f3ec" font-size="11" font-weight="600" '
            f'text-anchor="middle" dominant-baseline="central">{b.get("order")}</text>'
            f'<text y="26" fill="#2c2825" font-size="11" text-anchor="middle">{label}</text>'
            f"</g>"
        )
    return f"""<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="路径示意">
  <rect width="{w}" height="{h}" fill="#e8f0ef"/>
  <rect x="20" y="36" width="{w-40}" height="{h-72}" rx="16" fill="#d5e2df"/>
  <path d="M40,70 C160,40 280,50 400,55 L420,160 L60,170 Z" fill="#e8dcc8"/>
  <polyline fill="none" stroke="#785035" stroke-width="3" stroke-linecap="round"
    stroke-linejoin="round" points="{poly}"/>
  {''.join(dots)}
</svg>"""


def render_html(layout: dict, art_map: dict[str, str]) -> str:
    title = layout.get("title") or layout.get("id")
    lead = layout.get("guide_one_liner") or ""
    arcs = layout.get("arc") or []
    beats = layout.get("beats") or []
    density = layout.get("density") or "standard"

    arc_html = "".join(
        f'<li><strong>{a.get("name")}</strong><span>站 {", ".join(str(x) for x in (a.get("stop_orders") or []))}</span></li>'
        for a in arcs
    )

    # 步骤条：全站 happen（信息密度核心）
    steps = "".join(
        f"""<li>
          <span class="n">{b.get("order")}</span>
          <div>
            <div class="lab">{b.get("label")}</div>
            <div class="hp">{b.get("happen") or ""}</div>
            <div class="rf">{b.get("ref") or ""}</div>
          </div>
        </li>"""
        for b in beats
    )

    # 多格：有 vignette 的优先；无图也显示文字格
    cells = []
    for b in beats:
        order = str(b.get("order"))
        art = art_map.get(order, "")
        chips = "".join(f"<span>{c}</span>" for c in (b.get("chips") or [])[:3])
        thumb = (
            f'<div class="thumb" style="background-image:url(\'{art}\')"></div>'
            if art
            else '<div class="thumb empty">文字格</div>'
        )
        cells.append(
            f"""<article class="cell">
          {thumb}
          <div class="meta">
            <div class="row"><span class="n">{b.get("order")}</span><strong>{b.get("label")}</strong></div>
            <p class="happen">{b.get("happen") or ""}</p>
            <p class="link">{b.get("link") or ""}</p>
            <div class="chips">{chips}</div>
            <p class="note">{b.get("note") or ""}</p>
          </div>
        </article>"""
        )

    # 经文/母题清单
    checklists = []
    for b in beats:
        ms = b.get("must_see") or []
        if not ms:
            continue
        items = "".join(f"<li>{x}</li>" for x in ms)
        checklists.append(
            f"<div class='must'><h3>{b.get('order')} · {b.get('label')}</h3><ul>{items}</ul></div>"
        )

    return f"""<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title} · 知识信息页</title>
<style>
:root {{
  --ink:#2c2825; --muted:#6e675f; --paper:#f7f3ec; --line:#e5ddd0;
  --accent:#5b6b4f; --chip:#fffdf8; --card:#fff;
}}
* {{ box-sizing:border-box; }}
body {{
  margin:0; font-family:"PingFang SC","Noto Sans SC",sans-serif;
  color:var(--ink);
  background:
    radial-gradient(900px 420px at 10% -10%, #fff8ee, transparent 55%),
    linear-gradient(180deg,#f3eee5,var(--paper));
}}
main {{ max-width:720px; margin:0 auto; padding:20px 16px 64px; }}
.eyebrow {{ font-size:.72rem; color:var(--muted); letter-spacing:.04em; }}
h1 {{ font-size:1.45rem; margin:6px 0 8px; font-weight:650; letter-spacing:.01em; }}
.lead {{ margin:0 0 16px; color:var(--muted); line-height:1.55; font-size:.95rem; }}
.banner {{
  display:flex; flex-wrap:wrap; gap:8px; margin:0 0 18px;
}}
.banner span {{
  border:1px solid var(--line); background:var(--chip);
  border-radius:999px; padding:5px 11px; font-size:.72rem; color:var(--muted);
}}
section {{ margin:0 0 22px; }}
.sec-h {{
  display:flex; justify-content:space-between; align-items:baseline;
  margin:0 0 10px; font-size:.78rem; color:var(--muted);
}}
.sec-h strong {{ color:var(--ink); font-size:.95rem; }}
.card {{
  background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden;
}}
.card .pad {{ padding:12px 14px; }}
.arc {{ display:flex; gap:8px; list-style:none; margin:0; padding:0; flex-wrap:wrap; }}
.arc li {{
  flex:1; min-width:140px; background:var(--chip); border:1px solid var(--line);
  border-radius:12px; padding:10px 12px;
}}
.arc strong {{ display:block; font-size:.88rem; margin-bottom:4px; }}
.arc span {{ font-size:.72rem; color:var(--muted); }}
.map svg {{ display:block; width:100%; height:auto; }}
.steps {{ list-style:none; margin:0; padding:0; }}
.steps li {{
  display:flex; gap:10px; padding:10px 0; border-bottom:1px solid var(--line);
}}
.steps li:last-child {{ border-bottom:0; }}
.steps .n {{
  flex:0 0 24px; width:24px; height:24px; border-radius:50%;
  background:#785035; color:#f7f3ec; font-size:12px; font-weight:600;
  display:flex; align-items:center; justify-content:center; margin-top:2px;
}}
.steps .lab {{ font-weight:600; font-size:.9rem; }}
.steps .hp {{ margin-top:2px; font-size:.88rem; }}
.steps .rf {{ margin-top:2px; font-size:.72rem; color:var(--muted); }}
.grid {{
  display:grid; grid-template-columns:1fr 1fr; gap:10px;
}}
.cell {{
  background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden;
}}
.thumb {{
  height:110px; background:#ddd center/cover no-repeat;
}}
.thumb.empty {{
  display:flex; align-items:center; justify-content:center;
  color:var(--muted); font-size:.75rem; background:#efe8dc;
}}
.meta {{ padding:10px 11px 12px; }}
.meta .row {{ display:flex; gap:6px; align-items:center; }}
.meta .n {{
  width:18px; height:18px; border-radius:50%; background:#785035; color:#f7f3ec;
  font-size:11px; display:inline-flex; align-items:center; justify-content:center;
}}
.meta strong {{ font-size:.86rem; }}
.happen {{ margin:6px 0 0; font-size:.8rem; line-height:1.35; }}
.link {{ margin:4px 0 0; font-size:.72rem; color:var(--muted); line-height:1.35; }}
.note {{ margin:8px 0 0; font-size:.72rem; color:var(--muted); line-height:1.4; }}
.chips {{ display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }}
.chips span {{
  border:1px solid var(--line); border-radius:999px; padding:2px 8px;
  font-size:.68rem; color:var(--muted); background:#fff;
}}
.musts {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
.must {{ background:var(--chip); border:1px solid var(--line); border-radius:12px; padding:10px 12px; }}
.must h3 {{ margin:0 0 6px; font-size:.82rem; }}
.must ul {{ margin:0; padding-left:1.1em; color:var(--muted); font-size:.75rem; line-height:1.45; }}
.formula {{
  margin-top:8px; padding:12px 14px; background:#fff; border:1px dashed var(--line);
  border-radius:12px; font-size:.78rem; color:var(--muted); line-height:1.5;
}}
footer {{
  margin-top:8px; text-align:center; font-size:.7rem; color:var(--muted);
}}
@media (max-width:560px) {{
  .grid, .musts {{ grid-template-columns:1fr; }}
}}
</style>
</head>
<body>
<main>
  <div class="eyebrow">彼爱知识信息页 · density={density} · §19.14.12/13 · 字在 UI/SVG，不烤进位图</div>
  <h1>{title}</h1>
  <p class="lead">{lead}</p>
  <div class="banner">
    <span>来源：经文结构 layout</span>
    <span>模板：{layout.get('template') or 'path_grid_explain'}</span>
    <span>站数：{len(beats)}</span>
    <span>释义说明，仅供参考</span>
  </div>

  <section>
    <div class="sec-h"><strong>① 叙事弧</strong><span>结构层 · 先看脉络</span></div>
    <ul class="arc">{arc_html or '<li><strong>行程</strong><span>按站展开</span></li>'}</ul>
  </section>

  <section>
    <div class="sec-h"><strong>② 路径总览</strong><span>SVG diagram · 站名矢量字</span></div>
    <div class="card">{path_svg(layout)}</div>
  </section>

  <section>
    <div class="sec-h"><strong>③ 站序事实条</strong><span>每站一句 happen</span></div>
    <div class="card pad"><ol class="steps">{steps}</ol></div>
  </section>

  <section>
    <div class="sec-h"><strong>④ 多格叙事</strong><span>一格一事 · 图下短标</span></div>
    <div class="grid">{''.join(cells)}</div>
  </section>

  <section>
    <div class="sec-h"><strong>⑤ 画面母题清单</strong><span>must_see · 供填格验收</span></div>
    <div class="musts">{''.join(checklists) or '<p class="lead">暂无</p>'}</div>
  </section>

  <div class="formula">
    <strong>为何不是「一张大海报」：</strong>
    NotebookLM 信息多，靠的是「结构→版式→多区块同屏」；中文若烤进智谱像素易乱码、挡图。
    彼爱公式 = 经文结构 ×（路径 SVG + 多格 UI + 讲解）× AI 只填无字母题格。
  </div>
  <footer>生成自 data/knowledge/layouts/{layout.get('id')}.json · scripts/render_knowledge_infographic.py</footer>
</main>
</body>
</html>
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("layout_id", help="如 paul-first-journey")
    ap.add_argument("--open", action="store_true")
    args = ap.parse_args()

    layout = load_layout(args.layout_id)
    out = OUT_DIR / args.layout_id
    out.mkdir(parents=True, exist_ok=True)
    art_map = copy_art(layout, out / "art")
    html = render_html(layout, art_map)
    path = out / "index.html"
    path.write_text(html, encoding="utf-8")
    print("wrote", path.relative_to(ROOT), "cells", len(layout.get("beats") or []), "art", len(art_map))
    if args.open:
        subprocess.run(["open", str(path)], check=False)


if __name__ == "__main__":
    main()
