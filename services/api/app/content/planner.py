"""个性化读经计划生成（确定性、可离线、可测）。

按 scope 展开「卷·章」序列，均匀分配到 days 天。每天 1–N 章。
预留 `theme` 用于标题/分组，后续可接 LLM 生成导读语。
"""
from __future__ import annotations

from ..bible.reader import list_books

# 命名范围 → 卷 id 列表（按正典顺序）
NAMED_SCOPES: dict[str, list[str]] = {
    "gospels": ["MAT", "MRK", "LUK", "JHN"],
    "psalms": ["PSA"],
    "proverbs": ["PRO"],
    "pentateuch": ["GEN", "EXO", "LEV", "NUM", "DEU"],
    "paul": ["ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
             "1TH", "2TH", "1TI", "2TI", "TIT", "PHM"],
}

SCOPE_LABELS = {
    "all": "通读全本",
    "nt": "新约通读",
    "ot": "旧约通读",
    "gospels": "四福音",
    "psalms": "诗篇",
    "proverbs": "箴言",
    "pentateuch": "摩西五经",
    "paul": "保罗书信",
}


def _book_ids_for_scope(scope: str | None) -> list[str]:
    if not scope:
        return []
    books = list_books()
    if scope == "all":
        return [b["id"] for b in books]
    if scope == "nt":
        return [b["id"] for b in books if b["testament"] == "NT"]
    if scope == "ot":
        return [b["id"] for b in books if b["testament"] == "OT"]
    if scope in NAMED_SCOPES:
        valid = {b["id"] for b in books}
        return [bid for bid in NAMED_SCOPES[scope] if bid in valid]
    return []


def _chapter_units(book_ids: list[str]) -> list[tuple[str, str, int]]:
    """展开为 [(book_id, book_name, chapter), ...]。"""
    idx = {b["id"]: b for b in list_books()}
    units: list[tuple[str, str, int]] = []
    for bid in book_ids:
        b = idx.get(bid)
        if not b:
            continue
        for ch in range(1, int(b["chapter_count"]) + 1):
            units.append((bid, b["name"], ch))
    return units


def _parse_custom_refs(raw: str | None) -> list[tuple[str, str, int]]:
    """解析用户自定义经节：GEN.1, PSA.23, JHN.3-5。"""
    if not raw or not raw.strip():
        return []
    idx = {b["id"]: b for b in list_books()}
    units: list[tuple[str, str, int]] = []
    for part in raw.replace("，", ",").split(","):
        token = part.strip()
        if not token:
            continue
        if "-" in token and token.count(".") >= 1:
            base, end_s = token.rsplit("-", 1)
            if "." in base:
                bid, start_s = base.split(".", 1)
                bid = bid.upper()
                b = idx.get(bid)
                if not b:
                    continue
                try:
                    start, end = int(start_s), int(end_s)
                except ValueError:
                    continue
                for ch in range(min(start, end), max(start, end) + 1):
                    if 1 <= ch <= int(b["chapter_count"]):
                        units.append((bid, b["name"], ch))
                continue
        if "." in token:
            bid, ch_s = token.split(".", 1)
            bid = bid.upper()
            b = idx.get(bid)
            if not b:
                continue
            try:
                ch = int(ch_s)
            except ValueError:
                continue
            if 1 <= ch <= int(b["chapter_count"]):
                units.append((bid, b["name"], ch))
    return units


def generate_plan(
    scope: str | None,
    days: int,
    theme: str | None = None,
    custom_refs: str | None = None,
) -> dict:
    days = max(1, min(days, 365))
    book_ids = _book_ids_for_scope(scope)
    units = _chapter_units(book_ids)
    extra = _parse_custom_refs(custom_refs)
    if extra:
        seen = {(u[0], u[2]) for u in units}
        for u in extra:
            if (u[0], u[2]) not in seen:
                units.append(u)
                seen.add((u[0], u[2]))
    if not units:
        raise ValueError("请选择读经范围或填写自定义经节")

    # 均匀分配：每天 base 章，前 rem 天 +1，保证覆盖全部章节。
    total = len(units)
    days = min(days, total)
    base, rem = divmod(total, days)

    out_days: list[dict] = []
    pos = 0
    for d in range(1, days + 1):
        take = base + (1 if d <= rem else 0)
        chunk = units[pos:pos + take]
        pos += take
        refs = [f"{bid}.{ch}" for (bid, _name, ch) in chunk]
        first = chunk[0]
        last = chunk[-1]
        if first == last:
            title = f"{first[1]} {first[2]}"
        elif first[0] == last[0]:
            title = f"{first[1]} {first[2]}–{last[2]}"
        else:
            title = f"{first[1]} {first[2]} – {last[1]} {last[2]}"
        out_days.append({"day": d, "title": title, "refs": refs})

    label = SCOPE_LABELS.get(scope, "自定义") if scope else "自定义"
    scope_key = scope or "custom"
    plan_title = theme.strip() if (theme and theme.strip()) else f"{label} · {days} 天"
    return {
        "id": f"gen_{scope_key}_{days}",
        "title": plan_title,
        "scope": scope_key,
        "scope_label": label,
        "days_count": days,
        "chapters_total": total,
        "generated": True,
        "days": out_days,
    }
