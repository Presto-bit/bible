#!/usr/bin/env python3
"""66 卷书 + 章节摘要种子 → data/summaries/*.json

用法：
  python scripts/build_book_summaries.py
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "data" / "summaries"
SQLITE = REPO / "build" / "bible_cnv.sqlite"
OUTLINES = REPO / "apps" / "web" / "lib" / "outlines.ts"

BOOK_BLURBS: dict[str, str] = {
    "GEN": "《创世记》从创造、堕落、洪水到亚伯拉罕之约，记载族长时代与约瑟下埃及，为全本圣经的救赎历史奠基。",
    "EXO": "《出埃及记》记述以色列人在埃及为奴、神借摩西施行十灾、过红海得释放，在西奈山与神立约并领受律法。",
    "LEV": "《利未记》阐明祭司制度、献祭条例与圣洁生活，教导百姓如何在约中敬拜并分别为圣。",
    "NUM": "《民数记》记载旷野四十年漂流的旅程、人口统计与失败与复兴，显明神的引导与审判。",
    "DEU": "《申命记》为摩西临终之训，回顾出埃及历史，重申律法，预备百姓进入应许之地。",
    "JOS": "《约书亚记》记述征服迦南、分地给各支派，强调信靠神应许、持守约。",
    "JDG": "《士师记》呈现循环性的离弃、压迫、呼求与拯救，揭示人需要真正君王。",
    "RUT": "《路得记》以波阿斯与路得的故事，展现忠诚、救赎与弥赛亚家谱的伏笔。",
    "1SA": "《撒母耳记上》从末代士师到扫罗、大卫兴起，关注神对君王的拣选。",
    "2SA": "《撒母耳记下》聚焦大卫王朝的建立、扩张与家庭内部的挣扎。",
    "1KI": "《列王纪上》从所罗门建殿到王国分裂，记录先知以利亚的侍奉。",
    "2KI": "《列王纪下》南北国直至被掳的历史，以以利沙等先知信息贯穿。",
    "1CH": "《历代志上》从亚当到大卫，强调圣殿敬拜与神对大卫家的应许。",
    "2CH": "《历代志下》自所罗门至被掳归回，突出君王改革与圣殿。",
    "EZR": "《以斯拉记》记载首批归回、重建圣殿与律法复兴。",
    "NEH": "《尼希米记》记述城墙重建与社群更新，恢复约中的生活。",
    "EST": "《以斯帖记》在波斯背景下，显明神对犹太民族的隐藏保守。",
    "JOB": "《约伯记》探讨苦难与公义，最终指向神的智慧与主权。",
    "PSA": "《诗篇》是以色列的祈祷与赞美诗集，涵盖哀歌、感恩、智慧，指向对神的信靠与弥赛亚盼望。",
    "PRO": "《箴言》汇集智慧格言，教导敬畏耶和华是智慧的开端。",
    "ECC": "《传道书》反思虚空与有限，结论在于敬畏神、谨守诫命。",
    "SNG": "《雅歌》以爱情诗歌象征盟约之爱，常被理解为神与祂百姓的关系。",
    "ISA": "《以赛亚书》融合审判与安慰，包含弥赛亚与仆人之歌的丰富预言。",
    "JER": "《耶利米书》在犹大国末日前后，呼召悔改，预言新约。",
    "LAM": "《耶利米哀歌》为耶路撒冷毁灭而哀，仍存盼望于神的慈爱。",
    "EZK": "《以西结书》以异象与象征宣告审判与恢复，强调神的荣耀。",
    "DAN": "《但以理书》在巴比伦与波斯宫廷中，见证神掌管历史与末后国度。",
    "HOS": "《何西阿书》以先知婚姻比喻，揭示神对不忠之民仍不弃的爱。",
    "JOL": "《约珥书》呼吁悔改，预告圣灵浇灌与耶和华的日子。",
    "AMO": "《阿摩司书》向以色列宣告社会公义与真敬拜的要求。",
    "OBA": "《俄巴底亚书》预言以扫后裔的审判与神国建立。",
    "JON": "《约拿书》展现神对尼尼微的怜悯，超越民族界限。",
    "MIC": "《弥迦书》强调公义、怜悯与谦卑行路，预言伯利恒出生的君王。",
    "NAM": "《那鸿书》宣告尼尼微必受审判，显明神对压迫者的报应。",
    "HAB": "《哈巴谷书》在公义似乎迟延时，仍因信而喜乐。",
    "ZEP": "《西番雅书》警告审判，也应许余民与复兴。",
    "HAG": "《哈该书》激励重建圣殿，优先次序归正。",
    "ZEC": "《撒迦利亚书》以异象鼓励重建，指向弥赛亚与末后。",
    "MAL": "《玛拉基书》旧约末卷，责备形式敬拜，预告施洗约翰与主来。",
    "MAT": "《马太福音》强调耶稣是应验预言的弥赛亚，呈现天国伦理、神国比喻、受难与复活，并以大使命作结。",
    "MRK": "《马可福音》以行动叙事展现耶稣是服事的弥赛亚，强调十字架道路。",
    "LUK": "《路加福音》从救恩历史角度，关注穷人与外邦人，强调圣灵工作。",
    "JHN": "《约翰福音》从「道成肉身」展开，以七件神迹与「我是」宣告显明耶稣的神性，核心信息是信子得永生。",
    "ACT": "《使徒行传》接续福音，记述圣灵降临、教会扩张与保罗宣教旅程。",
    "ROM": "《罗马书》系统阐述因信称义、恩典与圣灵生活，为保罗神学核心。",
    "1CO": "《哥林多前书》处理教会分裂、道德与恩赐，强调爱。",
    "2CO": "《哥林多后书》为保罗使徒权柄与软弱中得力的见证。",
    "GAL": "《加拉太书》捍卫因信称义，反对靠行为得称义。",
    "EPH": "《以弗所书》描绘在基督里的身份、合一与属灵争战。",
    "PHP": "《腓立比书》在监禁中仍显喜乐，以基督为至宝。",
    "COL": "《歌罗西书》强调基督的至高与完全，对抗异端。",
    "1TH": "《帖撒罗尼迦前书》论主再来与圣洁生活。",
    "2TH": "《帖撒罗尼迦后书》纠正对末后的误解，劝勉站立。",
    "1TI": "《提摩太前书》为教牧指南，论监督、敬拜与假教师。",
    "2TI": "《提摩太后书》保罗临终遗训，嘱咐守真道、尽事奉。",
    "TIT": "《提多书》论教会秩序与善行的见证。",
    "PHM": "《腓利门书》为奴隶 Onesimus 求情，体现福音中的和好。",
    "HEB": "《希伯来书》表明基督超越旧约制度，劝勉持守信心。",
    "JAS": "《雅各书》强调信心与行为并行，真敬虔的实践。",
    "1PE": "《彼得前书》为受逼迫的信徒，以盼望与顺服劝勉。",
    "2PE": "《彼得后书》警惕假教师，提醒主再来。",
    "1JN": "《约翰一书》论与神相交、爱弟兄与辨别灵。",
    "2JN": "《约翰二书》劝勉在真理中行，谨慎接待。",
    "3JN": "《约翰三书》为忠心的该犹肯定，责备丢特腓。",
    "JUD": "《犹大书》为真道争辩，警戒堕落。",
    "REV": "《启示录》以异象揭示基督得胜、审判与新天新地。",
}


def _parse_outlines() -> dict[str, dict[int, str]]:
    if not OUTLINES.exists():
        return {}
    text = OUTLINES.read_text(encoding="utf-8")
    out: dict[str, dict[int, str]] = {}
    for m in re.finditer(
        r"'([A-Z0-9]+)\.(\d+)':\s*\[(.*?)\]",
        text,
        re.DOTALL,
    ):
        book, ch = m.group(1), int(m.group(2))
        block = m.group(3)
        titles = re.findall(r"title:\s*'([^']+)'", block)
        if titles:
            out.setdefault(book, {})[ch] = "；".join(titles[:4])
    return out


def main() -> int:
    if not SQLITE.exists():
        raise SystemExit(f"缺少经库：{SQLITE}")

    conn = sqlite3.connect(SQLITE)
    books = conn.execute(
        "SELECT id, name, testament, chapter_count FROM books ORDER BY sort_order"
    ).fetchall()
    conn.close()

    outlines = _parse_outlines()
    book_items = []
    chapter_items = []

    for bid, name, testament, ch_count in books:
        book_items.append({
            "book": bid,
            "name": name,
            "testament": testament,
            "chapter_count": ch_count,
            "summary": BOOK_BLURBS.get(bid, f"《{name}》是圣经{'旧约' if testament == 'OT' else '新约'}的一卷书。"),
        })
        for ch, summary in sorted(outlines.get(bid, {}).items()):
            chapter_items.append({
                "book": bid,
                "chapter": ch,
                "summary": summary,
            })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    books_path = OUT_DIR / "books.json"
    chapters_path = OUT_DIR / "chapters.json"
    books_path.write_text(
        json.dumps({
            "schema": "summaries_books@1",
            "count": len(book_items),
            "books": book_items,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    chapters_path.write_text(
        json.dumps({
            "schema": "summaries_chapters@1",
            "count": len(chapter_items),
            "chapters": chapter_items,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"✓ 摘要：{len(book_items)} 卷 / {len(chapter_items)} 章 → {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
