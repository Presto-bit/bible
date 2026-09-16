"""全产品 UGC 文本审核（书架 / 读经想法 / 同步 / 社交 / IM 共用）。

MVP：本地关键词 + 异端渗透词表；`moderate_text` 为统一入口，后续可换第三方内容安全 API。
普通外链 / 手机号 / 微信号允许发送（聊天内嵌打开）。
"""
from __future__ import annotations

import os
import re

MAX_LEN = 2000

# 用户可见提示（静穆、零 guilt）
_CATEGORY_MESSAGES: dict[str, str] = {
    "spam": "内容包含广告或营销信息，请修改后再试",
    "abuse": "内容包含不当词汇，请修改后再试",
    "sexual": "内容不适合在这里分享，请修改后再试",
    "violence": "请避免暴力或威胁性的表达",
    "harassment": "请用温和的话表达，这里适合安静分享",
    "illegal": "内容涉及不当信息，请修改后再试",
    "heresy": "内容疑似违反信仰准则",
}

# ── 广告 / 营销 / 诈骗 ──
_SPAM_WORDS = frozenset({
    "广告", "代购", "微商", "刷单", "传销", "诈骗", "赌博", "彩票内幕",
    "加微信", "加v", "加V", "私聊领", "免费领取", "扫码领", "日赚", "月入过万",
    "兼职赚钱", "推广员", "代开发票", "办证", "刻章", "刷单返利",
    "vpn推广", "菠菜", "网赌", "棋牌赚钱",
})

# ── 色情 / 低俗（避免单字误伤经文字句）──
_SEXUAL_WORDS = frozenset({
    "色情", "黄片", "黄网", "裸体", "裸聊", "约炮", "一夜情", "嫖娼", "卖淫",
    "援交", "开房", "做爱", "口交", "肛交", "性交", "自慰", "手淫", "射精",
    "阴茎", "阴道", "生殖器", "av片", "av资源", "porn", "pornhub", "xxx视频",
    "成人视频", "情色", "淫秽", "淫乱", "骚货", "发情",
})

# ── 暴力 / 威胁（短语为主，避免误伤「不可杀人」等经文引用）──
_VIOLENCE_PHRASES = frozenset({
    "弄死你", "杀了你", "砍死你", "打死你", "宰了你", "弄死", "去死吧",
    "你怎么不去死", "我要杀", "杀光", "灭门", "爆头", "肢解", "碎尸",
    "自杀方法", "自杀教程", "教你怎么死", "买凶", "雇凶", "人肉炸弹",
    "恐怖袭击", "屠杀", "血洗",
})

# ── 辱骂 / 吵架 ──
_HARASSMENT_WORDS = frozenset({
    "傻逼", "傻b", "傻B", "煞笔", "沙比", "弱智", "白痴", "智障", "脑残",
    "废物", "垃圾人", "贱人", "婊子", "狗东西", "狗日的", "畜生", "人渣",
    "滚蛋", "滚开", "去你的", "闭嘴吧", "神经病", "你怎么不去死",
    "他妈的", "你妈的", "妈逼", "我操", "我草", "操你", "cnm", "nmsl",
    "tmd", "wqnmlgb", "sb", "nm", "fuck you", "bitch", "asshole",
    "stupid idiot", "fuck", "shit",
})

# ── 违法 ──
_ILLEGAL_WORDS = frozenset({
    "冰毒", "海洛因", "可卡因", "大麻", "吸毒", "贩毒", "制毒",
    "买枪", "卖枪", "枪支弹药", "爆炸物制作", "制作炸弹", "假币",
    "洗钱", "黑客攻击", "盗号", "木马病毒",
})

# ── 其它不当 ──
_ABUSE_WORDS = frozenset({
    "代孕", "器官买卖", "人口贩卖",
})

# ── 异端 / 邪教渗透 ──
_HERESY_BLOCKLIST = frozenset({
    "东方闪电", "全能神", "呼喊派", "观音法门", "法轮大法",
    "门徒会", "三班仆人", "血水圣灵", "统一教", "新天地",
})

_HERESY_DOMAINS = frozenset({
    "godfootsteps.org",
    "kingdomsalvation.org",
    "holyspiritspeaks.org",
})

# 英文词用小写匹配
_ASCII_WORDS: dict[str, frozenset[str]] = {
    "sexual": frozenset({"porn", "pornhub", "xxx", "nude", "nudes", "hentai"}),
    "harassment": frozenset({"fuck", "shit", "bitch", "asshole", "motherfucker"}),
}


class ModerationError(Exception):
    """审核未通过。"""

    def __init__(self, reason: str, category: str = "abuse"):
        self.reason = reason
        self.category = category
        super().__init__(reason)


def _extra_words(env_key: str) -> frozenset[str]:
    raw = (os.environ.get(env_key) or "").strip()
    if not raw:
        return frozenset()
    return frozenset(w.strip().lower() for w in raw.split(",") if w.strip())


def _contains_phrase(text: str, low: str, phrase: str) -> bool:
    if not phrase:
        return False
    if phrase.isascii():
        return phrase.lower() in low
    return phrase in text


def _check_category(
    text: str,
    low: str,
    words: frozenset[str],
    category: str,
) -> None:
    for w in words:
        if _contains_phrase(text, low, w):
            raise ModerationError(_CATEGORY_MESSAGES[category], category=category)


def moderate_text(text: str | None, *, max_len: int = MAX_LEN) -> None:
    """对文本做审核，违规抛 ModerationError。空文本直接通过。"""
    if not text:
        return
    if len(text) > max_len:
        raise ModerationError("内容过长", category="abuse")
    low = text.lower()

    heresy = {w.lower() for w in _HERESY_BLOCKLIST} | set(_extra_words("SOCIAL_HERESY_WORDS"))
    for w in heresy:
        if w and w in low:
            raise ModerationError(_CATEGORY_MESSAGES["heresy"], category="heresy")
    for d in _HERESY_DOMAINS:
        if d in low:
            raise ModerationError(_CATEGORY_MESSAGES["heresy"], category="heresy")

    _check_category(text, low, _VIOLENCE_PHRASES, "violence")
    _check_category(text, low, _HARASSMENT_WORDS | _extra_words("CONTENT_MODERATION_HARASSMENT"), "harassment")
    _check_category(text, low, _SEXUAL_WORDS | _extra_words("CONTENT_MODERATION_SEXUAL"), "sexual")
    _check_category(text, low, _SPAM_WORDS | _extra_words("CONTENT_MODERATION_SPAM"), "spam")
    _check_category(text, low, _ILLEGAL_WORDS | _extra_words("CONTENT_MODERATION_ILLEGAL"), "illegal")
    _check_category(text, low, _ABUSE_WORDS | _extra_words("CONTENT_MODERATION_ABUSE"), "abuse")

    for cat, words in _ASCII_WORDS.items():
        for w in words:
            if re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", low):
                raise ModerationError(_CATEGORY_MESSAGES[cat], category=cat)


def moderate_fields(*parts: str | None, max_len: int = MAX_LEN) -> None:
    """依次审核多段用户文本（标题 + 正文等）。"""
    for part in parts:
        moderate_text(part, max_len=max_len)


# sync push：按实体审核 data 负载
_SYNC_TEXT_FIELDS: dict[str, tuple[str, ...]] = {
    "thought": ("body",),
    "note": ("body",),
    "ai_session": ("title",),
    "user_profile": ("bio",),
}


def moderate_sync_change(entity: str, change: dict) -> None:
    """增量同步 push 前审核用户文本字段；delete 或无 data 则跳过。"""
    if change.get("op") == "delete":
        return
    fields = _SYNC_TEXT_FIELDS.get(entity)
    if not fields:
        return
    data = change.get("data") or {}
    parts: list[str | None] = []
    for f in fields:
        val = data.get(f)
        if isinstance(val, str):
            parts.append(val)
    if entity == "note":
        tags = data.get("tags")
        if isinstance(tags, list):
            parts.extend(str(t) for t in tags if t)
    moderate_fields(*parts)
