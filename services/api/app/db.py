"""PostgreSQL 连接池（psycopg3）。延迟初始化，健康检查可单独探测。"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Optional

from psycopg_pool import ConnectionPool

from .config import get_settings

_pool: Optional[ConnectionPool] = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        # open=False：进程启动不强连，首次取连接时再建立，便于无 DB 时也能跑 /health
        conninfo = settings.database_url
        if "connect_timeout" not in conninfo:
            sep = "&" if "?" in conninfo else "?"
            conninfo = f"{conninfo}{sep}connect_timeout=2"
        _pool = ConnectionPool(
            conninfo=conninfo,
            min_size=0,
            max_size=10,
            open=True,
            timeout=3,
        )
    return _pool


@contextmanager
def get_conn(timeout: float = 3.0) -> Iterator["object"]:
    pool = get_pool()
    with pool.connection(timeout=timeout) as conn:
        yield conn


def ping() -> bool:
    """返回数据库是否可连通（供 /health/db）。快速失败，不阻塞健康检查。"""
    try:
        with get_conn(timeout=3.0) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
