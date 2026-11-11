"""轻量 schema 版本表：记录已执行的迁移文件名，避免 init SQL 编号冲突后无人知晓。

现有 ensure_*_schema 仍由 schema_bootstrap 负责；本表用于运维可见性与后续 Alembic 过渡。
"""
from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_ENSURE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

INIT_DIR = Path(__file__).resolve().parents[3] / "infra" / "postgres" / "init"


def ensure_migrations_table(pool) -> None:
    with pool.connection() as conn:
        conn.execute(_ENSURE)
        conn.commit()
    record_init_sql_inventory(pool)


def record_init_sql_inventory(pool) -> None:
    """把 init 目录下 SQL 文件名登记为 applied（幂等），便于对照重复编号。"""
    if not INIT_DIR.is_dir():
        return
    files = sorted(p.name for p in INIT_DIR.glob("*.sql"))
    if not files:
        return
    with pool.connection() as conn:
        for name in files:
            conn.execute(
                "INSERT INTO schema_migrations (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
                (f"init:{name}",),
            )
        conn.commit()
    # 检测编号重复并打日志
    prefixes: dict[str, list[str]] = {}
    for name in files:
        prefix = name.split("_", 1)[0]
        prefixes.setdefault(prefix, []).append(name)
    for prefix, names in prefixes.items():
        if len(names) > 1:
            logger.warning("postgres init SQL number collision %s: %s", prefix, ", ".join(names))


def mark_applied(pool, migration_id: str) -> None:
    with pool.connection() as conn:
        conn.execute(
            "INSERT INTO schema_migrations (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
            (migration_id,),
        )
        conn.commit()
