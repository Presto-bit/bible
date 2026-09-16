"""任意经文 → knowledge_layout@1 预览（§19.14.13/14）。

离线策展仍走 compile_knowledge_layout；本模块给「快速了解」自动结构。
不落盘；调用方决定是否入库。
"""
from __future__ import annotations

import json
import re
from typing import Any

from ..ai import llm

LAYOUT_FROM_SCRIPTURE_SYSTEM = """你是彼爱圣经讲解设计师。只输出一个 JSON，勿解释。
目标：把经文总结成可拼装的 knowledge_layout@1，供多区块同屏（叙事弧+站序+多格+讲解），不是大海报文案。

硬性规则：
1. 先读 scripture_text；beats[].happen 必须由原文动作驱动，≤14 汉字。
2. 不得发明改变叙事的核心情节；服饰/地理常识可进 note，但 happen 要克制。
3. 3–8 个 beats；有行程感则 template=path_grid_explain，否则 grid_explain。
4. skip 位图总览：blocks 含 beat_grid + explain_bar；行程可含 path_diagram。
5. 每 beat 给 ref（尽量具体）、happen、link（一句脉络）、chips 2–3 个、must_see 2–3 个、ask_seed。
6. arc 2–4 段，stop_orders 引用 beat.order。
7. guide_one_liner ≤40 字；density=standard。
8. vignette 留空字符串（由后续填格）。

输出 schema：
{
  "schema": "knowledge_layout@1",
  "id": "slug-ascii",
  "title": "中文标题",
  "guide_one_liner": "…",
  "density": "standard",
  "source": {"kind": "diagram", "id": "slug-ascii"},
  "template": "path_grid_explain|grid_explain",
  "blocks": [{"type":"path_diagram","schematic_id":"slug"},{"type":"beat_grid","columns":2},{"type":"explain_bar","fields":["title","ref","happen","chips","note","ask"]}],
  "arc": [{"name":"…","stop_orders":[1,2]}],
  "beats": [{"order":1,"place_id":"","label":"…","ref":"…","happen":"…","link":"…","chips":[],"must_see":[],"note":"…","ask_seed":"…","vignette":""}],
  "fill": {"engine_default":"none","policy":"AI 只填 vignette；中文在 UI"}
}
"""


def _slug(s: str) -> str:
    raw = re.sub(r"[^a-zA-Z0-9\-]+", "-", (s or "").strip().lower()).strip("-")
    return (raw or "knowledge-layout")[:48]


def _parse_json(content: str) -> dict[str, Any]:
    content = re.sub(r"^```json\s*|\s*```$", "", (content or "").strip())
    return json.loads(content)


def compile_layout_from_scripture(
    *,
    title: str,
    refs: list[str],
    scripture_text: str,
    era_geo: str | None = None,
    category: str | None = None,
) -> dict[str, Any]:
    text = (scripture_text or "").strip()
    if len(text) < 12:
        raise ValueError("scripture_text 过短")
    if not refs:
        raise ValueError("refs 必填")
    brief = {
        "title_zh": (title or "").strip() or "经文速览",
        "refs": refs,
        "scripture_text": text,
        "era_geo": era_geo or "biblical world; period dress; no modern clothes",
        "category": category or "叙事速览",
        "goal": "fast_understand_infographic_layout",
    }
    raw = llm.complete_chat(
        [
            {"role": "system", "content": LAYOUT_FROM_SCRIPTURE_SYSTEM},
            {"role": "user", "content": json.dumps(brief, ensure_ascii=False)},
        ],
        temperature=0.3,
        max_tokens=2200,
        timeout_sec=90.0,
    )
    layout = _parse_json(raw)
    if layout.get("schema") != "knowledge_layout@1":
        layout["schema"] = "knowledge_layout@1"
    lid = _slug(str(layout.get("id") or title or refs[0]))
    layout["id"] = lid
    layout.setdefault("source", {"kind": "diagram", "id": lid})
    layout.setdefault(
        "fill",
        {"engine_default": "none", "policy": "AI 只填 vignette；中文在 UI"},
    )
    beats = layout.get("beats") or []
    if not isinstance(beats, list) or len(beats) < 2:
        raise ValueError("layout.beats 不足")
    # 截断 happen
    for b in beats:
        if not isinstance(b, dict):
            continue
        hp = str(b.get("happen") or "").replace("\n", " ").strip()
        if len(hp) > 16:
            b["happen"] = hp[:14] + "…"
        b.setdefault("vignette", "")
    return layout
