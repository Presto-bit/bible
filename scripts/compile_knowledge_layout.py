#!/usr/bin/env python3
"""结构 → 版式编译器（§19.14.14）

从 map_tours（结构源）+ 策展补丁（happen/chips/arc/vignette）
编译出 knowledge_layout@1 JSON，供 API / Web 消费。

用法：
  python scripts/compile_knowledge_layout.py
  python scripts/compile_knowledge_layout.py --id exodus-wilderness
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOURS = ROOT / "data" / "geography" / "map_tours.json"
OUT_DIR = ROOT / "data" / "knowledge" / "layouts"

# 版式选择：行程类默认 path_grid_explain
TEMPLATE_MAP = {
    "exodus-wilderness": "path_grid_explain",
    "paul-first-journey": "path_grid_explain",
    "jesus-ministry-galilee": "path_grid_explain",
}

# 策展层：结构增强（不进生图乱写字）
CURATED: dict[str, dict] = {
    "exodus-wilderness": {
        "guide_one_liner": "从埃及到西奈：离开、过海、旷野供应与试炼，最终在山下安营。",
        "density": "standard",
        "arc": [
            {"name": "离开", "stop_orders": [1]},
            {"name": "拯救", "stop_orders": [2]},
            {"name": "供应与试炼", "stop_orders": [3, 4, 5]},
            {"name": "朝见预备", "stop_orders": [6]},
        ],
        "beats": {
            "egypt": {
                "happen": "百姓在苦役中，行程将启",
                "link": "奴役之地被抛在身后",
                "chips": ["为奴", "起行"],
                "must_see": ["泥砖城邑", "行进队伍", "旷野边缘"],
                "vignette": "/knowledge/vignettes/wilderness/00_overview.png",
            },
            "red-sea": {
                "happen": "水分开，百姓走干地",
                "link": "神开路拯救",
                "chips": ["水墙", "干地", "行进"],
                "must_see": ["左右海水墙", "干海床", "远景队伍"],
                "vignette": "/knowledge/vignettes/wilderness/01_red_sea.png",
            },
            "marah": {
                "happen": "苦水变甜",
                "link": "刚得救仍遇试炼",
                "chips": ["苦泉", "变甜"],
                "must_see": ["泉旁", "枯枝", "营地远景"],
                "vignette": "/knowledge/vignettes/wilderness/02_marah.png",
            },
            "elim": {
                "happen": "十二泉七十棕树歇息",
                "link": "苦后有供应之地",
                "chips": ["棕树", "泉源"],
                "must_see": ["棕树", "多泉", "帐篷"],
                "vignette": "/knowledge/vignettes/wilderness/03_elim.png",
            },
            "rephidim": {
                "happen": "击打磐石水流出",
                "link": "再次经历缺水被供应",
                "chips": ["磐石", "出水"],
                "must_see": ["裂石", "流水", "杖剪影"],
                "vignette": "/knowledge/vignettes/wilderness/05_rephidim.png",
            },
            "mount-sinai": {
                "happen": "在西奈山下安营",
                "link": "行程收束到朝见",
                "chips": ["山下", "安营"],
                "must_see": ["山体", "云雾", "环山帐篷"],
                "vignette": "/knowledge/vignettes/wilderness/06_sinai.png",
            },
        },
    },
    "paul-first-journey": {
        "guide_one_liner": "圣灵差遣保罗与巴拿巴：跨海、会堂讲道、外邦回应，再回到差遣教会回报。",
        "density": "standard",
        "arc": [
            {"name": "差遣与启程", "stop_orders": [1, 2]},
            {"name": "小亚细亚内陆", "stop_orders": [3, 4, 5, 6]},
            {"name": "回程与汇报", "stop_orders": [7]},
        ],
        "beats": {
            "antioch-syria": {
                "happen": "禁食祷告按手差遣",
                "link": "宣教从差遣教会出发",
                "chips": ["差遣", "祷告"],
                "must_see": ["室内窗光", "按手圈", "远景背影"],
                "vignette": "/knowledge/vignettes/paul/01_antioch_send.png",
                # order 7 回程单独覆盖
            },
            "cyprus": {
                "happen": "坐船往塞浦路斯传道",
                "link": "福音跨海进入岛屿",
                "chips": ["海船", "会堂"],
                "must_see": ["古帆船", "岛屿岸线", "柱廊"],
                "vignette": "/knowledge/vignettes/paul/02_cyprus.png",
            },
            "antioch-pisidia": {
                "happen": "安息日在会堂讲道",
                "link": "深入内陆会堂",
                "chips": ["会堂", "讲道"],
                "must_see": ["讲台", "听者背影", "经卷"],
                "vignette": "/knowledge/vignettes/paul/03_pisidian_antioch.png",
            },
            "iconium": {
                "happen": "多人信主也遇逼迫",
                "link": "福音双刃回应",
                "chips": ["信主", "逼迫"],
                "must_see": ["会堂外景", "人群分阵", "行囊起行"],
            },
            "lystra": {
                "happen": "医治后被人当作神",
                "link": "外邦城市的复杂",
                "chips": ["医治", "误会"],
                "must_see": ["柱廊", "站起姿态", "举手人群"],
                "vignette": "/knowledge/vignettes/paul/04_lystra.png",
            },
            "derbe": {
                "happen": "传福音并坚固门徒",
                "link": "建立后仍回访",
                "chips": ["门徒", "回访"],
                "must_see": ["城门口", "教导圈", "归途"],
            },
        },
        "beat_overrides_by_order": {
            "7": {
                "happen": "回报外邦信道的门开了",
                "link": "向差遣教会述说神所行的事",
                "chips": ["回报", "外邦"],
                "vignette": "/knowledge/vignettes/paul/01_antioch_send.png",
            }
        },
    },
    "jesus-ministry-galilee": {
        "guide_one_liner": "加利利：呼召、教导、医治与权柄显明，行程环绕湖区展开。",
        "density": "standard",
        "arc": [
            {"name": "呼召与起行", "stop_orders": [1, 2]},
            {"name": "教导与医治", "stop_orders": [3, 4, 5]},
            {"name": "权柄与回应", "stop_orders": [6, 7]},
        ],
    },
}


def _clip_happen(s: str, n: int = 18) -> str:
    s = (s or "").replace("\n", " ").strip()
    return s if len(s) <= n else s[:n] + "…"


def _happen_from_note(note: str) -> str:
    """无策展时：从 note 压一行事实（启发式）。"""
    note = (note or "").strip()
    if not note:
        return ""
    # 取第一分句
    for sep in ("——", "；", "。", "，"):
        if sep in note:
            note = note.split(sep, 1)[0]
            break
    return _clip_happen(note, 18)


def compile_tour(tour: dict) -> dict:
    tid = tour["id"]
    curated = CURATED.get(tid, {})
    template = TEMPLATE_MAP.get(tid, "path_grid_explain")
    beat_cur = curated.get("beats") or {}
    overrides = curated.get("beat_overrides_by_order") or {}

    beats = []
    for stop in tour.get("stops") or []:
        order = int(stop.get("order") or 0)
        pid = stop.get("place_id") or ""
        c = dict(beat_cur.get(pid) or {})
        # 同 place 多次出现：按 order 覆盖
        ovr = overrides.get(str(order))
        if ovr:
            c.update(ovr)
        happen = c.get("happen") or _happen_from_note(stop.get("note") or "")
        beats.append(
            {
                "order": order,
                "place_id": pid,
                "label": stop.get("label") or pid,
                "ref": stop.get("ref") or "",
                "happen": _clip_happen(happen, 18),
                "link": c.get("link") or "",
                "chips": c.get("chips") or [],
                "must_see": c.get("must_see") or [],
                "note": stop.get("note") or "",
                "ask_seed": stop.get("ask_seed") or "",
                "vignette": c.get("vignette") or "",
            }
        )

    blocks = [
        {"type": "path_diagram", "schematic_id": tid},
        {"type": "beat_grid", "columns": 2},
        {
            "type": "explain_bar",
            "fields": ["title", "ref", "happen", "chips", "note", "ask"],
        },
    ]

    return {
        "schema": "knowledge_layout@1",
        "id": tid,
        "title": tour.get("title") or tid,
        "guide_one_liner": curated.get("guide_one_liner")
        or tour.get("subtitle")
        or tour.get("description")
        or "",
        "density": curated.get("density") or "standard",
        "source": {"kind": "map_tour", "id": tid},
        "template": template,
        "blocks": blocks,
        "arc": curated.get("arc") or [],
        "beats": beats,
        "fill": {
            "engine_default": "none",
            "policy": "AI 只填 vignette 无字母题；中文 happen/站名由 UI/SVG；禁止烤底栏",
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", help="只编译指定 tour id")
    args = ap.parse_args()

    tours = json.loads(TOURS.read_text(encoding="utf-8")).get("tours") or []
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    written = []
    for tour in tours:
        tid = tour.get("id")
        if not tid:
            continue
        if args.id and tid != args.id:
            continue
        # 仅编译有版式映射的；加利利也可编
        if tid not in TEMPLATE_MAP and args.id is None:
            # 默认也编 jesus，已在 TEMPLATE_MAP
            pass
        if tid not in TEMPLATE_MAP:
            continue
        layout = compile_tour(tour)
        path = OUT_DIR / f"{tid}.json"
        path.write_text(json.dumps(layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written.append(path.name)
        print("wrote", path.relative_to(ROOT), "beats", len(layout["beats"]))

    index = {
        "schema": "knowledge_layouts_index@1",
        "count": len(written),
        "layouts": sorted(written),
    }
    (OUT_DIR / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("index", len(written))


if __name__ == "__main__":
    main()
