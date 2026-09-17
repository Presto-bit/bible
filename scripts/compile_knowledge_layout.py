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
        "cover_image": "/knowledge/infographics/exodus-wilderness-comic.png",
        "density": "standard",
        "arc": [
            {"name": "离开", "stop_orders": [1]},
            {"name": "拯救", "stop_orders": [2]},
            {"name": "供应与试炼", "stop_orders": [3, 4, 5]},
            {"name": "朝见预备", "stop_orders": [6]},
        ],
        "beats": {
            # 埃及站不占总览图；密图册走 comic/sNN，vignette 仅供示意/兜底
            "egypt": {
                "happen": "百姓在苦役中，行程将启",
                "link": "奴役之地被抛在身后",
                "chips": ["为奴", "起行"],
                "must_see": ["泥砖城邑", "行进队伍", "旷野边缘"],
                "verse_excerpt": "以色列人因作苦工，就叹息哀求，他们的哀声达于神。",
                "vignette": "",
            },
            "red-sea": {
                "happen": "水分开，百姓走干地",
                "link": "神开路拯救",
                "chips": ["水墙", "干地", "行进"],
                "must_see": ["左右海水墙", "干海床", "远景队伍"],
                "verse_excerpt": "摩西向海伸杖，耶和华便用大东风使海水一夜退去，水便分开，海就成了干地。",
                "vignette": "/knowledge/vignettes/wilderness/01_red_sea.png",
            },
            "marah": {
                "happen": "苦水变甜",
                "link": "刚得救仍遇试炼",
                "chips": ["苦泉", "变甜"],
                "must_see": ["泉旁", "枯枝", "营地远景"],
                "verse_excerpt": "摩西呼求耶和华，耶和华指示他一棵树。他把树丢在水里，水就变甜了。",
                "vignette": "/knowledge/vignettes/wilderness/02_marah.png",
            },
            "elim": {
                "happen": "十二泉七十棕树歇息",
                "link": "苦后有供应之地",
                "chips": ["棕树", "泉源"],
                "must_see": ["棕树", "多泉", "帐篷"],
                "verse_excerpt": "他们到了以琳，在那里有十二股水泉，七十棵棕树；他们就在那里的水边安营。",
                "vignette": "/knowledge/vignettes/wilderness/03_elim.png",
            },
            "rephidim": {
                "happen": "击打磐石水流出",
                "link": "再次经历缺水被供应",
                "chips": ["磐石", "出水"],
                "must_see": ["裂石", "流水", "杖剪影"],
                "verse_excerpt": "你要击打磐石，从磐石里必有水流出来，使百姓可以喝。",
                "vignette": "/knowledge/vignettes/wilderness/05_rephidim.png",
            },
            "mount-sinai": {
                "happen": "在西奈山下安营",
                "link": "行程收束到朝见",
                "chips": ["山下", "安营"],
                "must_see": ["山体", "云雾", "环山帐篷"],
                "verse_excerpt": "耶和华降临在西奈山顶上，耶和华召摩西上山顶，摩西就上去。",
                "vignette": "/knowledge/vignettes/wilderness/06_sinai.png",
            },
        },
    },
    "paul-first-journey": {
        # happen/link：遮掉图也能扫读「差遣→跨海→会堂→逼迫与医治→回报」
        "guide_one_liner": "使徒行传 13–14：差遣、跨海、会堂、逼迫与医治，再回报差遣教会。",
        "cover_image": "/knowledge/infographics/paul-first-journey-comic.png",
        "density": "standard",
        "arc": [
            {"name": "差遣与启程", "stop_orders": [1, 2]},
            {"name": "小亚细亚内陆", "stop_orders": [3, 4, 5, 6]},
            {"name": "回程与汇报", "stop_orders": [7]},
        ],
        "beats": {
            "antioch-syria": {
                "happen": "教会禁食祷告，按手差遣保罗与巴拿巴",
                "link": "整段旅程从这里出发",
                "chips": ["差遣", "祷告"],
                "must_see": ["室内窗光", "按手圈", "远景背影"],
                "vignette": "/knowledge/vignettes/paul/01_antioch_send.png",
            },
            "cyprus": {
                "happen": "坐船过海，在塞浦路斯会堂传道",
                "link": "福音第一次跨出海",
                "chips": ["海船", "会堂"],
                "must_see": ["古帆船", "岛屿岸线", "柱廊"],
                "vignette": "/knowledge/vignettes/paul/02_cyprus.png",
            },
            "antioch-pisidia": {
                "happen": "安息日进会堂，讲耶稣与赦罪",
                "link": "上岸后深入内陆会堂",
                "chips": ["会堂", "讲道"],
                "must_see": ["讲台", "听者背影", "经卷"],
                "vignette": "/knowledge/vignettes/paul/03_pisidian_antioch.png",
            },
            "iconium": {
                "happen": "许多人信了，也有人起来逼迫",
                "link": "同一信息，回应开始分裂",
                "chips": ["信主", "逼迫"],
                "must_see": ["会堂外景", "人群分阵", "行囊起行"],
                "vignette": "/knowledge/vignettes/paul/05_iconium.png",
            },
            "lystra": {
                "happen": "医好瘸子，众人却想拜他们为神",
                "link": "权能显明，外邦却误会",
                "chips": ["医治", "误会"],
                "must_see": ["柱廊", "站起姿态", "举手人群"],
                "vignette": "/knowledge/vignettes/paul/04_lystra.png",
            },
            "derbe": {
                "happen": "传福音、坚固门徒，再原路回访",
                "link": "建立教会后不丢下他们",
                "chips": ["门徒", "回访"],
                "must_see": ["城门口", "教导圈", "归途"],
                "vignette": "/knowledge/vignettes/paul/06_derbe.png",
            },
        },
        "beat_overrides_by_order": {
            "7": {
                "happen": "回到安提阿，述说外邦信道的门开了",
                "link": "向差遣他们的教会回报",
                "chips": ["回报", "外邦"],
                "vignette": "/knowledge/vignettes/paul/01_antioch_send.png",
            }
        },
    },
    "jesus-ministry-galilee": {
        "guide_one_liner": "从加利利起：呼召、教导与医治；权柄显明后，行程收束至耶路撒冷。",
        "cover_image": "/knowledge/infographics/jesus-ministry-galilee-comic.png",
        "density": "standard",
        "arc": [
            {"name": "呼召与起行", "stop_orders": [1, 2]},
            {"name": "教导与医治", "stop_orders": [3, 4, 5]},
            {"name": "权柄与回应", "stop_orders": [6, 7]},
        ],
        "beats": {
            "nazareth": {
                "happen": "家乡会堂宣告恩年",
                "link": "加利利事工从这里起行",
                "chips": ["会堂", "被拒"],
                "must_see": ["会堂卷轴", "乡邻围观", "起身离城"],
                "verse_excerpt": "主的灵在我身上，因为他用膏膏我，叫我传福音给贫穷的人。",
                "vignette": "",
            },
            "capernaum": {
                "happen": "以湖城为事工中心",
                "link": "教导与医治从此展开",
                "chips": ["教导", "医治"],
                "must_see": ["湖岸民居", "会堂门廊", "病患走近"],
                "verse_excerpt": "又离开拿撒勒，往迦百农去，就住在那里。",
                "vignette": "",
            },
            "sea-of-galilee": {
                "happen": "海边呼召得人的渔夫",
                "link": "门徒训练在湖畔起步",
                "chips": ["呼召", "渔夫"],
                "must_see": ["渔网船舷", "岸边脚印", "跟随背影"],
                "verse_excerpt": "来跟从我，我要叫你们得人如得鱼一样。",
                "vignette": "",
            },
            "bethsaida": {
                "happen": "五饼二鱼喂饱众人",
                "link": "怜悯显出供应的权柄",
                "chips": ["供应", "怜悯"],
                "must_see": ["碎饼篮筐", "坐地人群", "青草坡地"],
                "verse_excerpt": "你们给他们吃吧。……他们就都吃，并且吃饱了。",
                "vignette": "",
            },
            "caesarea-philippi": {
                "happen": "彼得认祂为基督",
                "link": "认信之后听见受难之路",
                "chips": ["认信", "受难"],
                "must_see": ["山麓磐石", "门徒围圈", "远望北方"],
                "verse_excerpt": "西门彼得回答说：「你是基督，是永生神的儿子。」",
                "vignette": "",
            },
            "mount-of-olives-2": {
                "happen": "面向圣城讲论末后",
                "link": "加利利之后逼近耶路撒冷",
                "chips": ["儆醒", "末后"],
                "must_see": ["橄榄山脊", "圣城轮廓", "门徒侧听"],
                "verse_excerpt": "你们要谨慎，儆醒祈祷，因为你们不晓得那日期几时来到。",
                "vignette": "",
            },
            "jerusalem": {
                "happen": "荣入圣城走向十架",
                "link": "行程收束在救恩高峰",
                "chips": ["入城", "受难"],
                "must_see": ["城门棕枝", "圣殿远景", "窄路上行"],
                "verse_excerpt": "要对锡安的居民说：看哪，你的王来到你这里，是温柔的，又骑着驴。",
                "vignette": "",
            },
        },
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
                "verse_excerpt": c.get("verse_excerpt") or "",
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

    out = {
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
    cover = (curated.get("cover_image") or "").strip()
    if cover:
        out["cover_image"] = cover
    return out


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
