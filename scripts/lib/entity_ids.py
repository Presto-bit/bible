"""词典实体 ID 解析：只返回唯一命中，多候选/未命中写入审核报告。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from lib.bible_names_zh import NAME_ZH, zh_name
from lib.usfm import slugify

# 已知歧义或历史端点 → canonical id。禁止把同名人物静默猜成某一个。
CURATED_ALIASES: dict[str, str] = {
    "isaac": "以撒",
    "esau": "以扫",
    "noah": "挪亚",
    "noah-son-of-lamech": "挪亚",
    "joshua-son-of-nun": "joshua",
    "jacob": "jacob_patriarch",
    "jacob_patriarch": "jacob_patriarch",
    "israel_person": "jacob_patriarch",
    "joseph-son-of-jacob": "joseph_son",
    "joseph_son": "joseph_son",
    "joseph-husband": "joseph_husband",
    "john-apostle": "john_apostle",
    "john_apostle": "john_apostle",
    "john-baptist": "john_baptist",
    "john-the-baptist": "john_baptist",
    "john_baptist": "john_baptist",
    "joseph-husband": "joseph_husband",
    "joseph_husband": "joseph_husband",
    "mary-mother-of-jesus": "mary_mother",
    "mary_mother": "mary_mother",
    "barnabas": "巴拿巴",
    "elisha": "以利沙",
    "boaz": "波阿斯",
    "timothy": "提摩太",
    "titus": "提多",
    "capernaum": "迦百农",
    "西奈山": "sinai",
    "sinai": "sinai",
    "mount-sinai": "sinai",
    "埃及": "egypt",
    "egypt": "egypt",
    "red-sea": "红海",
    "red_sea": "红海",
    "tabernacle": "会幕",
    "temple": "圣殿",
    "ark": "约柜",
    "ark-of-the-covenant": "约柜",
    "passover": "逾越节",
}


@dataclass(frozen=True)
class ResolveHit:
    token: str
    entity_id: str | None
    status: str  # ok | missing | ambiguous
    candidates: tuple[str, ...] = ()
    reason: str = ""


@dataclass
class EntityIndex:
    entities: list[dict]
    by_id: dict[str, dict] = field(default_factory=dict)
    _keys: dict[str, list[str]] = field(default_factory=dict)

    @classmethod
    def from_entities(cls, entities: Iterable[dict]) -> "EntityIndex":
        idx = cls(entities=list(entities))
        idx._build()
        return idx

    def _add_key(self, raw: str, entity_id: str) -> None:
        key = _norm_key(raw)
        if not key:
            return
        bucket = self._keys.setdefault(key, [])
        if entity_id not in bucket:
            bucket.append(entity_id)

    def _build(self) -> None:
        self.by_id = {}
        self._keys = {}
        name_to_ids: dict[str, list[str]] = {}
        for ent in self.entities:
            eid = str(ent.get("id") or "").strip()
            if not eid:
                continue
            self.by_id[eid] = ent
            self._add_key(eid, eid)
            self._add_key(slugify(eid), eid)
            name = str(ent.get("name") or "").strip()
            if name:
                self._add_key(name, eid)
                name_to_ids.setdefault(name, []).append(eid)
                en = None
                for alias in ent.get("aliases") or []:
                    self._add_key(str(alias), eid)
                    self._add_key(slugify(str(alias)), eid)
                    if not _has_cjk(str(alias)):
                        en = str(alias)
                if en:
                    self._add_key(slugify(en), eid)
        # 英文专名 → 中文名，仅当该中文名对应唯一词条
        for en, zh in NAME_ZH.items():
            ids = name_to_ids.get(zh) or []
            if len(ids) == 1:
                self._add_key(en, ids[0])
                self._add_key(slugify(en), ids[0])
        for alias, canonical in CURATED_ALIASES.items():
            if canonical in self.by_id:
                self._add_key(alias, canonical)
                self._add_key(slugify(alias), canonical)

    def resolve(self, token: str) -> ResolveHit:
        raw = str(token or "").strip()
        if not raw:
            return ResolveHit(token=raw, entity_id=None, status="missing", reason="empty")
        if raw in self.by_id:
            return ResolveHit(token=raw, entity_id=raw, status="ok")
        curated = CURATED_ALIASES.get(raw) or CURATED_ALIASES.get(_norm_key(raw))
        if curated and curated in self.by_id:
            return ResolveHit(token=raw, entity_id=curated, status="ok", reason="curated_alias")
        ids = list(dict.fromkeys(self._keys.get(_norm_key(raw), [])))
        if not ids:
            zh = zh_name(raw)
            if zh:
                ids = list(dict.fromkeys(self._keys.get(_norm_key(zh), [])))
        if len(ids) == 1:
            return ResolveHit(token=raw, entity_id=ids[0], status="ok")
        if len(ids) > 1:
            return ResolveHit(
                token=raw,
                entity_id=None,
                status="ambiguous",
                candidates=tuple(ids),
                reason="multiple_entities",
            )
        return ResolveHit(token=raw, entity_id=None, status="missing", reason="not_found")

    def require(self, token: str) -> str | None:
        hit = self.resolve(token)
        return hit.entity_id if hit.status == "ok" else None


def _has_cjk(s: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in (s or ""))


def _norm_key(s: str) -> str:
    t = str(s or "").strip().lower()
    t = t.replace("_", "-").replace(" ", "-")
    t = slugify(t)
    return t
