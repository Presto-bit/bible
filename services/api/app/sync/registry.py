"""同步实体注册表：声明每个用户实体的表/主键/数据列/类型。

两类形态：
  • versioned=True：id 主键 + version + deleted（tombstone），删除=软删
  • versioned=False：复合主键单例/计数（无 version/deleted），删除=物理删
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class EntitySpec:
    entity: str
    table: str
    pk_cols: tuple[str, ...]          # 完整主键（含 user_id 或 id）
    key_cols: tuple[str, ...]         # 业务键（除 user_id 外，供信封 keys）
    data_cols: tuple[str, ...]        # 负载列
    versioned: bool
    json_cols: frozenset[str] = field(default_factory=frozenset)
    array_cols: frozenset[str] = field(default_factory=frozenset)

    @property
    def id_based(self) -> bool:
        return self.pk_cols == ("id",)


REGISTRY: dict[str, EntitySpec] = {
    "note": EntitySpec(
        "note", "user_note", ("id",), ("id",),
        ("ref", "body", "tags", "is_private"), True, array_cols=frozenset({"tags"}),
    ),
    "highlight": EntitySpec(
        "highlight", "user_highlight", ("id",), ("id",), ("ref", "color"), True,
    ),
    "bookmark": EntitySpec(
        "bookmark", "user_bookmark", ("id",), ("id",), ("ref",), True,
    ),
    "ai_session": EntitySpec(
        "ai_session", "ai_session", ("id",), ("id",), ("anchor_ref", "title"), True,
    ),
    "reading_progress": EntitySpec(
        "reading_progress", "reading_progress", ("user_id",), (),
        ("book", "chapter", "verse"), False,
    ),
    "reading_log": EntitySpec(
        "reading_log", "reading_log", ("user_id", "date"), ("date",),
        ("minutes", "chapters"), False,
    ),
    "plan_progress": EntitySpec(
        "plan_progress", "plan_progress", ("user_id", "plan_id"), ("plan_id",),
        ("day", "status", "session"), False, json_cols=frozenset({"session"}),
    ),
    "user_profile": EntitySpec(
        "user_profile", "user_profile", ("user_id",), (),
        ("avatar_id", "bio", "username", "user_code"), False,
    ),
}


def get_spec(entity: str) -> EntitySpec | None:
    return REGISTRY.get(entity)


def all_entities() -> list[str]:
    return list(REGISTRY.keys())
