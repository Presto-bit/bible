#!/usr/bin/env python3
"""优化每日经文：力量 / 信心 / 鼓励 为主，深度为辅。

产出 data/daily-verses/daily_verses.json（schema daily_verses@3）：
  - tone: strength | faith | encourage | depth
  - arc: stand | go | trust | lift | depth（力量感子类）
  - line: 一行导语（首页副文案）

配比目标约：strength 40% / faith 30% / encourage 20% / depth 10%
周节奏：前行 → 确信 → 站立 → 鼓励 → 前行/确信 → 站立/安慰 → 敬拜收束

用法：
  python3 scripts/optimize_daily_verses_strength.py
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DAILY = REPO / "data" / "daily-verses" / "daily_verses.json"
CLASSIC = REPO / "data" / "daily-verses" / "classic_verse_pool.json"

NAME = {
    "GEN": "创世记", "EXO": "出埃及记", "LEV": "利未记", "NUM": "民数记", "DEU": "申命记",
    "JOS": "约书亚记", "JDG": "士师记", "RUT": "路得记", "1SA": "撒母耳记上", "2SA": "撒母耳记下",
    "1KI": "列王纪上", "2KI": "列王纪下", "1CH": "历代志上", "2CH": "历代志下", "EZR": "以斯拉记",
    "NEH": "尼希米记", "EST": "以斯帖记", "JOB": "约伯记", "PSA": "诗篇", "PRO": "箴言",
    "ECC": "传道书", "SNG": "雅歌", "ISA": "以赛亚书", "JER": "耶利米书", "LAM": "耶利米哀歌",
    "EZK": "以西结书", "DAN": "但以理书", "HOS": "何西阿书", "JOL": "约珥书", "AMO": "阿摩司书",
    "OBA": "俄巴底亚书", "JON": "约拿书", "MIC": "弥迦书", "NAM": "那鸿书", "HAB": "哈巴谷书",
    "ZEP": "西番雅书", "HAG": "哈该书", "ZEC": "撒迦利亚书", "MAL": "玛拉基书", "MAT": "马太福音",
    "MRK": "马可福音", "LUK": "路加福音", "JHN": "约翰福音", "ACT": "使徒行传", "ROM": "罗马书",
    "1CO": "哥林多前书", "2CO": "哥林多后书", "GAL": "加拉太书", "EPH": "以弗所书", "PHP": "腓立比书",
    "COL": "歌罗西书", "1TH": "帖撒罗尼迦前书", "2TH": "帖撒罗尼迦后书", "1TI": "提摩太前书",
    "2TI": "提摩太后书", "TIT": "提多书", "PHM": "腓利门书", "HEB": "希伯来书", "JAS": "雅各书",
    "1PE": "彼得前书", "2PE": "彼得后书", "1JN": "约翰一书", "2JN": "约翰二书", "3JN": "约翰三书",
    "JUD": "犹大书", "REV": "启示录",
}

# (book, ch, vs, ve, theme, tone, arc, line)
CURATED: list[tuple[str, int, int, int, str, str, str, str]] = [
    # —— 站立型 strength/stand ——
    ("PSA", 73, 26, 26, "盼望", "strength", "stand", "衰残之处，祂仍是力量"),
    ("ISA", 41, 10, 10, "勇气", "strength", "stand", "你不是一个人硬撑"),
    ("2CO", 12, 9, 9, "力量", "strength", "stand", "软弱不是出局"),
    ("PSA", 46, 1, 1, "力量", "strength", "stand", "先躲进祂，再站起来"),
    ("PSA", 27, 1, 1, "勇气", "strength", "stand", "怕，也有光可跟"),
    ("NAM", 1, 7, 7, "安慰", "strength", "stand", "难处里有保障"),
    ("DEU", 31, 6, 6, "勇气", "strength", "stand", "路再难，有同行者"),
    ("PSA", 18, 32, 32, "力量", "strength", "stand", "今天被祂束上力量"),
    ("PSA", 28, 7, 7, "力量", "strength", "stand", "心靠祂，就得帮助"),
    ("PSA", 31, 24, 24, "勇气", "strength", "stand", "凡仰望耶和华的，都要壮胆"),
    ("HAB", 3, 19, 19, "力量", "strength", "stand", "主耶和华是我的力量"),
    ("PSA", 18, 2, 2, "信靠", "strength", "stand", "祂是我的岩石、我的山寨"),
    ("EXO", 14, 14, 14, "力量", "strength", "stand", "不要作声，看祂争战"),
    ("2KI", 6, 16, 16, "信靠", "strength", "stand", "与我们同在的，比他们更多"),
    ("PSA", 121, 1, 2, "信靠", "strength", "stand", "帮助从造天地的耶和华而来"),
    ("ISA", 43, 2, 2, "应许", "strength", "stand", "过水火，祂仍同在"),
    ("PSA", 34, 18, 18, "安慰", "strength", "stand", "心碎之处，祂靠近"),
    ("MAT", 11, 28, 28, "安慰", "strength", "stand", "劳苦的人，到我这里来"),
    ("PSA", 46, 10, 10, "平安", "strength", "stand", "你们要休息，要知道我是神"),
    ("ROM", 8, 37, 37, "盼望", "strength", "stand", "靠着爱我们的主，已经得胜有余"),
    # —— 前行型 strength/go ——
    ("JOS", 1, 9, 9, "勇气", "strength", "go", "去，祂与你同在"),
    ("ISA", 40, 31, 31, "力量", "strength", "go", "飞、跑、走，都有力"),
    ("PHP", 4, 13, 13, "力量", "strength", "go", "不是靠自己硬扛"),
    ("PHP", 3, 14, 14, "使命", "strength", "go", "眼睛向前，不向后"),
    ("HEB", 12, 1, 2, "忍耐", "strength", "go", "定睛耶稣再跑"),
    ("HAG", 2, 4, 4, "力量", "strength", "go", "动手时，祂在场"),
    ("2TI", 1, 7, 7, "勇气", "strength", "go", "胆怯不是从神来的"),
    ("EPH", 6, 10, 10, "力量", "strength", "go", "刚强的源头是主"),
    ("1CO", 16, 13, 13, "勇气", "strength", "go", "当壮胆，要刚强"),
    ("EST", 4, 14, 14, "使命", "strength", "go", "此时此刻，正是为你预备"),
    ("ISA", 6, 8, 8, "使命", "strength", "go", "我在这里，请差遣我"),
    ("MAT", 28, 19, 20, "使命", "strength", "go", "去，使万民作门徒"),
    ("ACT", 1, 8, 8, "圣灵", "strength", "go", "得着能力，作祂见证"),
    ("GAL", 6, 9, 9, "忍耐", "strength", "go", "行善不可丧志"),
    ("PRO", 16, 3, 3, "引导", "strength", "go", "所行的交托耶和华"),
    ("COL", 3, 23, 23, "工作", "strength", "go", "无论做什么，都从心里做"),
    ("ZEC", 4, 6, 6, "圣灵", "strength", "go", "不是倚靠势力，乃是倚靠我的灵"),
    ("LUK", 1, 37, 37, "力量", "strength", "go", "出于神的话，没有一句不带能力"),
    ("JDG", 6, 12, 12, "力量", "strength", "go", "大能的勇士，耶和华与你同在"),
    ("PSA", 18, 29, 29, "力量", "strength", "go", "我靠你冲入敌军"),
    # —— 确信型 faith/trust ——
    ("ROM", 8, 31, 31, "应许", "faith", "trust", "天平已经倾向你"),
    ("ROM", 8, 28, 28, "盼望", "faith", "trust", "乱局里仍有旨意"),
    ("PRO", 3, 5, 6, "信靠", "faith", "trust", "信靠，比算尽更稳"),
    ("HEB", 11, 1, 1, "盼望", "faith", "trust", "未见之前先站定"),
    ("MRK", 9, 23, 23, "信靠", "faith", "trust", "信心打开可能"),
    ("1JN", 5, 4, 4, "信靠", "faith", "trust", "胜，从信开始"),
    ("PSA", 56, 3, 4, "信靠", "faith", "trust", "怕可以有，信也要有"),
    ("JER", 29, 11, 11, "盼望", "faith", "trust", "前途在祂手里"),
    ("ROM", 15, 13, 13, "盼望", "faith", "trust", "因信得着喜乐平安"),
    ("LAM", 3, 22, 23, "恩典", "faith", "trust", "祂的怜悯不至断绝"),
    ("JER", 17, 7, 7, "信靠", "faith", "trust", "倚靠耶和华的有福了"),
    ("PSA", 37, 5, 5, "信靠", "faith", "trust", "当将你的事交托耶和华"),
    ("PSA", 125, 1, 1, "信靠", "faith", "trust", "倚靠耶和华的人，好像锡安山"),
    ("ISA", 55, 11, 11, "应许", "faith", "trust", "祂的话决不徒然返回"),
    ("MAT", 28, 20, 20, "应许", "faith", "trust", "我就常与你们同在"),
    ("HEB", 13, 5, 5, "应许", "faith", "trust", "我不撇下你，也不丢弃你"),
    ("2CO", 1, 20, 20, "应许", "faith", "trust", "神的应许在基督都是是的"),
    ("PSA", 37, 4, 4, "应许", "faith", "trust", "以耶和华为乐，祂就成全"),
    ("HAB", 2, 4, 4, "信靠", "faith", "trust", "义人必因信得生"),
    ("LUK", 18, 27, 27, "信靠", "faith", "trust", "在神凡事都能"),
    ("ROM", 5, 5, 5, "盼望", "faith", "trust", "盼望不至于羞耻"),
    ("PSA", 42, 11, 11, "盼望", "faith", "trust", "应当仰望神"),
    ("JOB", 19, 25, 25, "盼望", "faith", "trust", "我知道我的救赎主活着"),
    ("JHN", 11, 25, 25, "永生", "faith", "trust", "信我的人虽然死了，也必复活"),
    ("ROM", 8, 38, 39, "爱", "faith", "trust", "没有什么能叫我们与神的爱隔绝"),
    ("JHN", 3, 16, 16, "爱", "faith", "trust", "神爱世人，甚至将祂的独生子赐给他们"),
    ("ISA", 9, 6, 6, "盼望", "faith", "trust", "有一婴孩为我们而生"),
    ("1PE", 5, 7, 7, "信靠", "faith", "trust", "你们要将一切的忧虑卸给神"),
    ("PSA", 9, 10, 10, "信靠", "faith", "trust", "认识你名的人要倚靠你"),
    ("PSA", 62, 1, 1, "信靠", "faith", "trust", "我的心默默无声，专等候神"),
    # —— 鼓励型 encourage/lift ——
    ("NUM", 6, 24, 26, "祝福", "encourage", "lift", "今天领受一份祝福"),
    ("NEH", 8, 10, 10, "力量", "encourage", "lift", "喜乐本身就是力量"),
    ("PSA", 16, 11, 11, "喜乐", "encourage", "lift", "靠近祂就有满足的喜乐"),
    ("PHP", 4, 6, 7, "平安", "encourage", "lift", "把忧虑交出去"),
    ("ISA", 26, 3, 3, "平安", "encourage", "lift", "心定，平安就定"),
    ("PSA", 23, 1, 1, "平安", "encourage", "lift", "有牧者就不慌"),
    ("JHN", 16, 33, 33, "平安", "encourage", "lift", "苦难真，得胜也真"),
    ("PSA", 118, 24, 24, "喜乐", "encourage", "lift", "这是耶和华所定的日子"),
    ("PHP", 4, 4, 4, "喜乐", "encourage", "lift", "你们要靠主常常喜乐"),
    ("ZEP", 3, 17, 17, "喜乐", "encourage", "lift", "祂因你欢欣喜乐"),
    ("PSA", 30, 5, 5, "喜乐", "encourage", "lift", "一宿虽然有哭泣，早晨便必欢呼"),
    ("JHN", 15, 11, 11, "喜乐", "encourage", "lift", "叫你们的喜乐可以满足"),
    ("PSA", 100, 4, 4, "感恩", "encourage", "lift", "当称谢进入祂的门"),
    ("1TH", 5, 18, 18, "感恩", "encourage", "lift", "凡事谢恩"),
    ("PSA", 107, 1, 1, "感恩", "encourage", "lift", "你们要称谢耶和华，因祂本为善"),
    ("PSA", 84, 11, 11, "恩典", "encourage", "lift", "耶和华要赐下恩惠和荣耀"),
    ("EPH", 2, 8, 9, "恩典", "encourage", "lift", "你们得救是本乎恩"),
    ("HEB", 4, 16, 16, "恩典", "encourage", "lift", "坦然无惧来到施恩的宝座前"),
    ("2CO", 9, 8, 8, "恩典", "encourage", "lift", "神能将各样的恩惠多多加给你们"),
    ("PSA", 103, 1, 2, "感恩", "encourage", "lift", "我的心哪，你要称颂耶和华"),
    ("JHN", 14, 27, 27, "平安", "encourage", "lift", "我留下平安给你们"),
    ("COL", 3, 15, 15, "平安", "encourage", "lift", "叫基督的平安在你们心里作主"),
    ("PSA", 4, 8, 8, "平安", "encourage", "lift", "安然躺下睡觉"),
    ("PSA", 91, 1, 1, "平安", "encourage", "lift", "住在至高者隐密处的"),
    ("ISA", 43, 1, 1, "安慰", "encourage", "lift", "你是属我的，不要害怕"),
    ("PSA", 139, 14, 14, "创造", "encourage", "lift", "我受造奇妙可畏"),
    ("ROM", 5, 8, 8, "爱", "encourage", "lift", "基督在我们还作罪人的时候为我们死"),
    ("1JN", 4, 19, 19, "爱", "encourage", "lift", "我们爱，因为神先爱我们"),
    ("JER", 31, 3, 3, "爱", "encourage", "lift", "我以永远的爱爱你"),
    ("PSA", 23, 4, 4, "平安", "encourage", "lift", "我虽然行过死荫的幽谷，也不怕遭害"),
    # —— 深度 depth（约占 10%，穿插） ——
    ("PSA", 51, 10, 10, "赦免", "depth", "depth", "求你为我造清洁的心"),
    ("1JN", 1, 9, 9, "赦免", "depth", "depth", "我们若认自己的罪"),
    ("MIC", 6, 8, 8, "公义", "depth", "depth", "行公义，好怜悯，存谦卑的心"),
    ("JAS", 1, 5, 5, "智慧", "depth", "depth", "你们中间若有缺少智慧的"),
    ("PSA", 90, 12, 12, "智慧", "depth", "depth", "求你指教我们怎样数算自己的日子"),
    ("PHP", 2, 3, 5, "谦卑", "depth", "depth", "当以基督的心为心"),
    ("ROM", 12, 2, 2, "顺服", "depth", "depth", "不要效法这个世界"),
    ("JAS", 1, 2, 4, "忍耐", "depth", "depth", "落在百般试炼中，都要以为大喜乐"),
    ("PSA", 119, 105, 105, "引导", "depth", "depth", "你的话是我脚前的灯"),
    ("ISA", 53, 5, 5, "救恩", "depth", "depth", "因祂受的鞭伤，我们得医治"),
    ("MAT", 5, 4, 4, "安慰", "depth", "depth", "哀恸的人有福了"),
    ("JOB", 1, 21, 21, "谦卑", "depth", "depth", "赏赐的是耶和华，收取的也是耶和华"),
    ("PSA", 139, 23, 24, "祷告", "depth", "depth", "神啊，求你鉴察我"),
    ("ROM", 12, 1, 1, "敬拜", "depth", "depth", "将身体献上，当作活祭"),
    ("JHN", 15, 5, 5, "顺服", "depth", "depth", "离了我，你们就不能做什么"),
]

THEME_TONE = {
    "力量": ("strength", "go"),
    "勇气": ("strength", "stand"),
    "信靠": ("faith", "trust"),
    "应许": ("faith", "trust"),
    "盼望": ("faith", "trust"),
    "救恩": ("faith", "trust"),
    "喜乐": ("encourage", "lift"),
    "祝福": ("encourage", "lift"),
    "恩典": ("encourage", "lift"),
    "平安": ("encourage", "lift"),
    "感恩": ("encourage", "lift"),
    "安慰": ("encourage", "lift"),
    "爱": ("encourage", "lift"),
    # 苦难/试炼偏「被托住」，少进沉重 depth
    "苦难": ("encourage", "lift"),
    "谦卑": ("depth", "depth"),
    "智慧": ("faith", "trust"),
    "赦免": ("depth", "depth"),
    "公义": ("depth", "depth"),
    "顺服": ("faith", "trust"),
    "忍耐": ("strength", "go"),
    "祷告": ("faith", "trust"),
    "敬拜": ("encourage", "lift"),
    "引导": ("faith", "trust"),
    "使命": ("strength", "go"),
    "圣灵": ("strength", "go"),
    "复活": ("faith", "trust"),
    "永生": ("faith", "trust"),
    "教会": ("encourage", "lift"),
    "家庭": ("encourage", "lift"),
    "工作": ("strength", "go"),
    "焦虑": ("encourage", "lift"),
    "宽恕": ("depth", "depth"),
    "创造": ("encourage", "lift"),
}

THEME_LINE = {
    "力量": "今天靠祂得力",
    "勇气": "壮胆，祂与你同在",
    "信靠": "把心安放在祂的应许里",
    "应许": "祂的话比处境更真",
    "盼望": "前景在祂手里",
    "救恩": "被救赎的人，站得住",
    "喜乐": "靠主，喜乐可以有",
    "祝福": "今天领受一份祝福",
    "恩典": "恩典够你用",
    "平安": "心可以先安静下来",
    "感恩": "先数算祂的恩典",
    "安慰": "愿你被这句话托住",
    "爱": "你被深深地爱着",
    "苦难": "难处里，仍有同行者",
    "谦卑": "安静下来，听祂说话",
    "智慧": "求智慧，祂厚赐",
    "赦免": "坦然来到施恩座前",
    "公义": "行公义，好怜悯",
    "顺服": "跟从祂，路就开",
    "忍耐": "坚持下去，必有收成",
    "祷告": "把心里的话告诉祂",
    "敬拜": "抬起眼来仰望祂",
    "引导": "一步一步，有光可跟",
    "使命": "此刻，正是为你预备",
    "圣灵": "不是靠势力，是靠圣灵",
    "复活": "盼望不止于今天",
    "永生": "信靠祂的，有永生",
    "教会": "你们是彼此的肢体",
    "家庭": "爱从家里开始",
    "工作": "无论做什么，都从心里做",
    "焦虑": "把忧虑交出去",
    "宽恕": "饶恕，也释放自己",
    "创造": "你受造奇妙可畏",
}

# 周一=0 … 周日=6 → 优先 tone
WEEK_TONE = [
    "strength",   # 一 前行
    "faith",      # 二 确信
    "strength",   # 三 站立
    "encourage",  # 四 鼓励
    "faith",      # 五 确信/前行
    "strength",   # 六 站立
    "encourage",  # 日 收束
]

FALLBACK_LINE = {
    "strength": "今天靠祂得力",
    "faith": "把心安放在祂的应许里",
    "encourage": "愿你被这句话托住",
    "depth": "安静下来，听祂说话",
}


def ref_label(book: str, ch: int, vs: int, ve: int) -> str:
    v = f"{vs}" if vs == ve else f"{vs}-{ve}"
    return f"{NAME[book]} {ch}:{v}"


def item_from_curated(t: tuple) -> dict:
    book, ch, vs, ve, theme, tone, arc, line = t
    return {
        "ref": ref_label(book, ch, vs, ve),
        "book": book,
        "chapter": ch,
        "verse_start": vs,
        "verse_end": ve,
        "theme": theme,
        "tone": tone,
        "arc": arc,
        "line": line,
        "text": None,
    }


def key_of(v: dict) -> tuple:
    return (v.get("book"), v.get("chapter"), v.get("verse_start"), v.get("verse_end") or v.get("verse_start"))


def tag_existing(v: dict) -> dict:
    theme = (v.get("theme") or "盼望").strip()
    tone, arc = THEME_TONE.get(theme, ("faith", "trust"))
    out = dict(v)
    # 重新标定：以主题映射为准（避免旧文件残留错误 tone）
    out["tone"] = tone
    out["arc"] = arc
    out["line"] = (
        out.get("line")
        or THEME_LINE.get(theme)
        or FALLBACK_LINE.get(tone, FALLBACK_LINE["faith"])
    )
    out["text"] = None
    return out


NARRATIVE_BOOKS = {
    "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT",
    "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST",
}


def is_chapter_opener_filler(v: dict) -> bool:
    """过滤叙述书卷「第 N 章第 1 节」劣质补位（如创世记 9:1）。"""
    book = v.get("book")
    vs = int(v.get("verse_start") or 0)
    ve = int(v.get("verse_end") or vs)
    ch = int(v.get("chapter") or 0)
    if book not in NARRATIVE_BOOKS:
        return False
    if vs != 1 or ve != 1:
        return False
    # 创 1:1 等开篇可保留；其余章首多为谱系/叙事起头
    return ch >= 2


def pick_from(pool: list[dict], want_tone: str, used: set, prefer_arc: str | None = None) -> dict | None:
    arcs = [prefer_arc] if prefer_arc else [None]
    if prefer_arc:
        arcs.append(None)
    for arc in arcs:
        for v in pool:
            k = key_of(v)
            if k in used:
                continue
            if v.get("tone") != want_tone:
                continue
            if arc and v.get("arc") != arc:
                continue
            return v
    return None


def load_base_verses() -> list[dict]:
    """优先用 git HEAD 的优质日历；失败则读当前文件并过滤劣质补位。"""
    import subprocess

    try:
        raw = subprocess.check_output(
            ["git", "show", "HEAD:data/daily-verses/daily_verses.json"],
            cwd=REPO,
            stderr=subprocess.DEVNULL,
        )
        data = json.loads(raw.decode("utf-8"))
        verses = data.get("verses") or []
        if len(verses) >= 365:
            return verses[:365]
    except Exception:
        pass
    if DAILY.exists():
        data = json.loads(DAILY.read_text(encoding="utf-8"))
        return list(data.get("verses") or [])[:365]
    return []


def plan_tones() -> list[str]:
    """先排 365 天 tone 槽：周节奏 + 配额 ≈ 40/30/20/10。"""
    targets = {"strength": 146, "faith": 110, "encourage": 73, "depth": 36}
    counts: Counter = Counter()
    slots: list[str] = []
    for day in range(1, 366):
        want = WEEK_TONE[(day - 1) % 7]
        # 约每 10 天插入一天 depth（避开把力量日冲掉过多）
        if day % 10 == 0 and counts["depth"] < targets["depth"]:
            want = "depth"
        order = [want, "strength", "faith", "encourage", "depth"]
        if want == "depth":
            order = ["depth", "encourage", "faith", "strength"]
        chosen = want
        for t in order:
            remain = 365 - day + 1
            need_others = sum(max(0, targets[x] - counts[x]) for x in targets if x != t)
            # 若选 t 会导致其余 tone 无法凑齐配额，则跳过
            if counts[t] >= targets[t] and need_others >= remain:
                continue
            if counts[t] < targets[t] or t == want:
                chosen = t
                break
        slots.append(chosen)
        counts[chosen] += 1

    # 末尾微调到精确配额
    for tone, target in targets.items():
        while counts[tone] > target:
            for i in range(len(slots) - 1, -1, -1):
                if slots[i] != tone:
                    continue
                for alt, at in targets.items():
                    if counts[alt] < at:
                        slots[i] = alt
                        counts[tone] -= 1
                        counts[alt] += 1
                        break
                break
        while counts[tone] < target:
            for i in range(len(slots) - 1, -1, -1):
                cur = slots[i]
                if counts[cur] <= targets[cur]:
                    continue
                if cur == tone:
                    continue
                slots[i] = tone
                counts[cur] -= 1
                counts[tone] += 1
                break
            else:
                break
    return slots


def main() -> int:
    curated = [item_from_curated(t) for t in CURATED]
    pin = next(v for v in curated if v["book"] == "PSA" and v["chapter"] == 73 and v["verse_start"] == 26)

    base = load_base_verses()
    # 合并：curated 优先，再补 HEAD/经典池；同钥用 curated 覆盖
    quality: list[dict] = []
    seen_q: set[tuple] = set()
    curated_by_start = {
        (v["book"], v["chapter"], v["verse_start"]): v for v in curated
    }
    for v in curated:
        k = key_of(v)
        seen_q.add(k)
        quality.append(dict(v))
    for v in base:
        if is_chapter_opener_filler(v):
            continue
        tagged = tag_existing(v)
        k = key_of(tagged)
        if k in seen_q:
            continue
        # 同章同起始节时，套用 curated 的导语/tone（即使 verse_end 不同）
        loose = curated_by_start.get((tagged["book"], tagged["chapter"], tagged["verse_start"]))
        if loose:
            tagged["tone"] = loose["tone"]
            tagged["arc"] = loose["arc"]
            tagged["line"] = loose["line"]
            tagged["theme"] = loose.get("theme") or tagged.get("theme")
        seen_q.add(k)
        quality.append(tagged)

    # classic 池也并入质量池
    if CLASSIC.exists():
        old_c = json.loads(CLASSIC.read_text(encoding="utf-8"))
        for item in old_c.get("verses") or []:
            ref = (item.get("ref") or "").strip()
            # "PSA 73:26" or "PSA 73:1-2"
            parts = ref.replace("：", ":").split()
            if len(parts) < 2:
                continue
            book = parts[0]
            if book not in NAME:
                continue
            try:
                ch_s, vs_s = parts[1].split(":", 1)
                if "-" in vs_s:
                    a, b = vs_s.split("-", 1)
                    vs, ve = int(a), int(b)
                else:
                    vs = ve = int(vs_s)
                ch = int(ch_s)
            except ValueError:
                continue
            row = {
                "ref": ref_label(book, ch, vs, ve),
                "book": book,
                "chapter": ch,
                "verse_start": vs,
                "verse_end": ve,
                "theme": item.get("theme") or "盼望",
                "tone": item.get("tone"),
                "arc": item.get("arc"),
                "line": item.get("line"),
                "text": None,
            }
            row = tag_existing(row)
            if is_chapter_opener_filler(row):
                continue
            k = key_of(row)
            if k in seen_q:
                continue
            seen_q.add(k)
            quality.append(row)

    buckets: dict[str, list[dict]] = {t: [] for t in ("strength", "faith", "encourage", "depth")}
    for v in quality:
        buckets.setdefault(v["tone"], []).append(v)

    tone_slots = plan_tones()
    year: list[dict | None] = [None] * 365
    used: set[tuple] = set()

    # 固定今日示例：day 210 = 诗篇 73:26
    year[209] = {**pin, "day": 210}
    used.add(key_of(pin))

    # 先把 curated 尽量放到匹配 tone 的空位（均匀铺开）
    curated_left = [v for v in curated if key_of(v) not in used]
    for v in curated_left:
        want = v["tone"]
        candidates = [i for i, t in enumerate(tone_slots) if year[i] is None and t == want]
        if not candidates:
            continue  # 留给后续按槽抽取；勿占错 tone 位
        occupied = [i for i, x in enumerate(year) if x is not None]
        if occupied:
            best = max(candidates, key=lambda i: min(abs(i - j) for j in occupied))
        else:
            best = candidates[0]
        year[best] = {**v, "day": best + 1}
        used.add(key_of(v))

    # 按 tone 槽填剩余天；strength 可循环 curated 补足配额
    reuse_pools = {
        t: [dict(v) for v in curated if v["tone"] == t] or list(buckets.get(t, []))
        for t in buckets
    }
    reuse_idx = Counter()

    for i, want in enumerate(tone_slots):
        if year[i] is not None:
            continue
        day = i + 1
        prefer_arc = None
        if want == "strength":
            prefer_arc = "go" if day % 2 == 1 else "stand"
        chosen = pick_from(buckets.get(want, []), want, used, prefer_arc)
        if chosen is None:
            chosen = pick_from(buckets.get(want, []), want, used, None)
        if chosen is None:
            # 同 tone 循环补足配额（优先于降级到其他 tone）
            pool = reuse_pools.get(want) or [v for v in curated if v["tone"] == want] or curated
            chosen = dict(pool[reuse_idx[want] % len(pool)])
            reuse_idx[want] += 1
            # 循环条目仍带正确 tone/line
            chosen["tone"] = want
            if not chosen.get("line"):
                chosen["line"] = FALLBACK_LINE.get(want, FALLBACK_LINE["faith"])
        else:
            used.add(key_of(chosen))
        row = dict(chosen)
        row["day"] = day
        # 以当日 tone 槽为准，保证配比
        row["tone"] = want
        if want == "strength" and row.get("arc") not in ("go", "stand"):
            row["arc"] = prefer_arc or "stand"
        elif want == "faith":
            row["arc"] = "trust"
        elif want == "encourage":
            row["arc"] = "lift"
        elif want == "depth":
            row["arc"] = "depth"
        row["line"] = row.get("line") or THEME_LINE.get(row.get("theme", ""), "") or FALLBACK_LINE.get(
            want, FALLBACK_LINE["faith"]
        )
        row["text"] = None
        year[i] = row

    # 若 pin 被 tone 槽冲掉 tone，强制写回
    year[209] = {**pin, "day": 210}

    final: list[dict] = []
    for i, v in enumerate(year):
        assert v is not None
        row = dict(v)
        row["day"] = i + 1
        # 槽位 tone 与条目不一致时，以条目为准（已 curated）；line 必须有
        row["line"] = row.get("line") or FALLBACK_LINE.get(row.get("tone", "faith"), FALLBACK_LINE["faith"])
        final.append(row)

    themes = sorted({v["theme"] for v in final if v.get("theme")})
    out = {
        "schema": "daily_verses@3",
        "source": "optimize_daily_verses_strength",
        "note": "tone=strength|faith|encourage|depth；arc=stand|go|trust|lift|depth；line=一行导语。text 由经库解析。",
        "count": len(final),
        "tones": {
            "strength": "~40% 力量/勇气/站立与前行",
            "faith": "~30% 信靠/应许/盼望确信",
            "encourage": "~20% 喜乐/祝福/恩典/平安",
            "depth": "~10% 苦难/智慧/赦罪沉思",
        },
        "themes": themes,
        "verses": final,
    }
    DAILY.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

    classic_verses = []
    seen_classic: set[str] = set()
    for v in curated:
        ref = f"{v['book']} {v['chapter']}:{v['verse_start']}"
        if ref in seen_classic:
            continue
        seen_classic.add(ref)
        classic_verses.append({
            "ref": ref,
            "theme": v["theme"],
            "tone": v["tone"],
            "arc": v["arc"],
            "line": v["line"],
        })
    if CLASSIC.exists():
        old_c = json.loads(CLASSIC.read_text(encoding="utf-8"))
        for item in old_c.get("verses") or []:
            ref = item.get("ref")
            if not ref or ref in seen_classic:
                continue
            seen_classic.add(ref)
            theme = item.get("theme") or "盼望"
            tone, arc = THEME_TONE.get(theme, ("faith", "trust"))
            classic_verses.append({
                "ref": ref,
                "theme": theme,
                "tone": item.get("tone") or tone,
                "arc": item.get("arc") or arc,
                "line": item.get("line") or FALLBACK_LINE.get(tone, FALLBACK_LINE["faith"]),
            })
    CLASSIC.write_text(
        json.dumps(
            {
                "schema": "classic_verse_pool@2",
                "description": "力量与信心优化池 + 经典补位，供 enrich / 运营挑选",
                "verses": classic_verses,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    c = Counter(v["tone"] for v in final)
    print(f"✓ daily_verses.json：{len(final)} 条")
    print(
        "  tone 分布:",
        ", ".join(f"{k}={c[k]}({100 * c[k] / len(final):.0f}%)" for k in ["strength", "faith", "encourage", "depth"]),
    )
    for d in range(208, 222):
        v = final[d - 1]
        print(f"  day {d}: [{v['tone']}/{v['arc']}] {v['ref']} · {v['line']}")
    print(f"✓ classic_verse_pool.json：{len(classic_verses)} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
