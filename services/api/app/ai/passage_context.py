"""经文章节释经上下文提要：为 OIA「经文解释」提供背景/脉络/对象/意图素材。"""
from __future__ import annotations

from ..bible.refs import ScriptureRef
from ..content import loader

# 书卷取向（对象 + 意图，通识级；无 RAG 时供模型谨慎参考）
BOOK_INTROS: dict[str, str] = {
    "GEN": "面向以色列民，回顾创造与先祖故事，建立神与选民立约的宏大叙事。",
    "EXO": "面向刚出埃及的以色列，说明救恩、律法与会幕，塑造群体身份。",
    "LEV": "面向祭司与全体会众，规范敬拜、圣洁与生活秩序。",
    "NUM": "面向旷野世代的以色列，记录旅程、数点与信靠神的教训。",
    "DEU": "面向即将进迦南的新世代，重申约言，劝勉忠信顺服。",
    "JOS": "面向已进入应许地的以色列，见证神信实与地业分配。",
    "PSA": "面向会众与个人灵修，以诗歌表达敬拜、哀歌与对神的信赖。",
    "PRO": "面向年轻人与寻求智慧者，教导敬畏耶和华的生活洞见。",
    "ISA": "面向犹大与余民，在审判与安慰中指向神的圣洁与救恩应许。",
    "JER": "面向被掳前后犹大人，解释审判原因并持守约中的盼望。",
    "MAT": "面向犹太背景读者，表明耶稣是应许弥赛亚与天国君王。",
    "MRK": "面向罗马世界读者，强调耶稣是服事与受死的仆人弥赛亚。",
    "LUK": "面向提阿非罗及外邦读者，以有序叙事见证救恩临到万人。",
    "JHN": "面向多元背景读者，见证耶稣是基督、神子，叫人信而得生命。",
    "ACT": "面向同一代读者，叙述圣灵工作，说明福音从耶路撒冷扩到万邦。",
    "ROM": "面向罗马教会，阐明因信称义与福音如何更新群体生活。",
    "1CO": "面向哥林多教会，处理分裂与伦理问题，指向基督里的合一。",
    "GAL": "面向加拉太教会，捍卫因信称义，对抗靠行为得义。",
    "EPH": "面向以弗所及小亚细亚众教会，揭示在基督里的新群体与身份。",
    "PHP": "面向腓立比教会，在患难中鼓励以基督为中心的同心。",
    "HEB": "面向受压的犹太基督徒，表明基督是更美约的中保与终极祭物。",
    "JAS": "面向散居的犹太基督徒，强调真实信心必显于行动与关怀。",
    "1PE": "面向受逼害的信徒，安慰并劝勉在寄居中见证盼望。",
    "REV": "面向七教会及末世代代读者，以异象揭示主再临与得胜盼望。",
}


def _section_titles_near_verse(ref: ScriptureRef) -> list[str]:
    if ref.chapter is None:
        return []
    marks = loader.section_titles(ref.book_id, ref.chapter, lang="zh")
    if not marks:
        return []
    if ref.verse_start is None:
        return [str(m.get("title") or "").strip() for m in marks[:3] if m.get("title")]
    titles: list[str] = []
    for m in marks:
        verse = int(m.get("verse") or 0)
        title = str(m.get("title") or "").strip()
        if not title:
            continue
        if verse <= ref.verse_start:
            titles.append(title)
    if titles:
        return titles[-2:]
    return [str(marks[0].get("title") or "").strip()] if marks[0].get("title") else []


def passage_context_brief(
    ref: ScriptureRef | None,
    *,
    max_chars: int = 240,
) -> str:
    """结构化上下文（注入 user 消息，不增加 ### 小节）。"""
    if not ref or ref.chapter is None:
        return ""
    lines: list[str] = []
    intro = BOOK_INTROS.get(ref.book_id.upper())
    if intro:
        lines.append(f"书卷取向：{intro}")
    tl = loader.timeline_for(ref.book_id, ref.chapter)
    if tl and tl.get("year_display"):
        lines.append(f"年代参考：约 {tl['year_display']}。")
    sections = _section_titles_near_verse(ref)
    if sections:
        label = " / ".join(sections)
        lines.append(f"段落位置：{ref.display} 位于「{label}」附近。")
    places = loader.places_for_chapter(ref.book_id, ref.chapter, limit=3)
    if places:
        names = "、".join(
            str(p.get("name") or "").strip() for p in places if p.get("name")
        )
        if names:
            lines.append(f"相关地点：{names}。")
    if not lines:
        return ""
    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[: max_chars - 1].rstrip() + "…"
    return text
