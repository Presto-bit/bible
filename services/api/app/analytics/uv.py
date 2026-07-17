"""每日 UV：设备为主键，登录后归并 user_id（方案 C）。"""
from __future__ import annotations

import logging
import threading

from ..time_cn import china_today

logger = logging.getLogger(__name__)

_SKIP_PREFIXES = (
    "/health",
    "/admin",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/analytics/visit",
    "/content/uv-visit",
)

_schema_lock = threading.Lock()
_schema_ready = False
_last_error: str | None = None


def uv_last_error() -> str | None:
    return _last_error


def _set_err(msg: str | None) -> None:
    global _last_error
    _last_error = msg


# 统计去重身份：优先归并到 8 位 user_code（多设备 / 先游客后登录只计 1）；否则按设备计
def uv_identity_sql(alias: str | None = None) -> str:
    prefix = f"{alias}." if alias else "daily_active_visitors."
    fp = f"{alias}.device_fingerprint" if alias else "daily_active_visitors.device_fingerprint"
    by_user = f"""(
      SELECT ac.user_code
      FROM accounts ac
      WHERE ac.user_id = {prefix}user_id
      LIMIT 1
    )"""
    by_bind = f"""(
      SELECT dub.user_code
      FROM device_user_bindings dub
      WHERE dub.device_fingerprint = {fp}
      LIMIT 1
    )"""
    return (
        f"COALESCE({by_user}, {by_bind}, "
        f"{prefix}user_id::text, {prefix}device_fingerprint)"
    )


UV_IDENTITY_SQL = uv_identity_sql()


def should_record_uv(path: str, method: str) -> bool:
    if method.upper() == "OPTIONS":
        return False
    return not any(path.startswith(prefix) for prefix in _SKIP_PREFIXES)


def normalize_device_id(device_id: str | None) -> str | None:
    device = (device_id or "").strip()
    if not device:
        return None
    return device[:128]


def resolve_device_fingerprint(
    *, user_id: str | None, device_id: str | None
) -> str | None:
    device = normalize_device_id(device_id)
    if device:
        return device
    if user_id:
        return f"uid:{user_id}"
    return None


def legacy_visitor_key(*, user_id: str | None, device_id: str | None) -> str | None:
    """兼容旧 visitor_key 列与测试。"""
    if user_id:
        return f"u:{user_id}"
    device = normalize_device_id(device_id)
    if device:
        return f"d:{device}"
    return None


def visitor_key(*, user_id: str | None, device_id: str | None) -> str | None:
    return legacy_visitor_key(user_id=user_id, device_id=device_id)


def _has_uv_v2(conn) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'daily_active_visitors'
          AND column_name = 'device_fingerprint'
        LIMIT 1
        """
    ).fetchone()
    return bool(row)


def _has_device_unique(conn) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'daily_active_visitors'
          AND indexname = 'daily_active_visitors_date_device_uq'
        LIMIT 1
        """
    ).fetchone()
    return bool(row)


def _table_exists(conn) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'daily_active_visitors'
        LIMIT 1
        """
    ).fetchone()
    return bool(row)


def ensure_uv_schema(conn) -> None:
    """缺表 / 缺列时就地补齐，避免迁移未跑导致全日 UV=0。"""
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_active_visitors (
              visit_date DATE NOT NULL DEFAULT (timezone('Asia/Shanghai', now()))::date,
              visitor_key TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              PRIMARY KEY (visit_date, visitor_key)
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS daily_active_visitors_date_idx
              ON daily_active_visitors (visit_date)
            """
        )
        conn.execute(
            """
            ALTER TABLE daily_active_visitors
              ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
              ADD COLUMN IF NOT EXISTS user_id UUID,
              ADD COLUMN IF NOT EXISTS user_bound_at TIMESTAMPTZ,
              ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              ADD COLUMN IF NOT EXISTS user_code TEXT
            """
        )
        # 回填 fingerprint，再加非空与唯一索引（幂等）
        conn.execute(
            """
            UPDATE daily_active_visitors
            SET device_fingerprint = CASE
              WHEN visitor_key LIKE 'd:%' THEN substring(visitor_key FROM 3)
              WHEN visitor_key LIKE 'u:%' THEN 'legacy-u:' || substring(visitor_key FROM 3)
              ELSE visitor_key
            END
            WHERE device_fingerprint IS NULL
            """
        )
        conn.execute(
            """
            UPDATE daily_active_visitors
            SET device_fingerprint = 'unknown:' || visitor_key
            WHERE device_fingerprint IS NULL OR device_fingerprint = ''
            """
        )
        try:
            conn.execute(
                "ALTER TABLE daily_active_visitors ALTER COLUMN device_fingerprint SET NOT NULL"
            )
        except Exception:
            pass
        try:
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS daily_active_visitors_date_device_uq
                  ON daily_active_visitors (visit_date, device_fingerprint)
                """
            )
        except Exception as exc:
            logger.warning("UV 设备唯一索引创建失败（可继续用 visitor_key）：%s", exc)
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS daily_active_visitors_user_date_idx
              ON daily_active_visitors (visit_date, user_id)
              WHERE user_id IS NOT NULL
            """
        )
        conn.commit()
        _schema_ready = True


def _lookup_bound_user_id(conn, device_fingerprint: str) -> str | None:
    try:
        row = conn.execute(
            """
            SELECT ac.user_id::text
            FROM device_user_bindings dub
            JOIN accounts ac ON ac.user_code = dub.user_code
            WHERE dub.device_fingerprint = %s
            LIMIT 1
            """,
            (device_fingerprint,),
        ).fetchone()
        return row[0] if row else None
    except Exception as exc:
        logger.warning("UV 设备绑定查询失败（已忽略）：%s", exc)
        try:
            conn.rollback()
        except Exception:
            pass
        return None


def _ensure_users_row(conn, user_id: str) -> None:
    """UV 表 user_id 有 FK → users(id)；中间件不走 resolve_user_id，须自行补行。"""
    try:
        conn.execute(
            "INSERT INTO users (id) VALUES (%s) ON CONFLICT (id) DO NOTHING",
            (user_id,),
        )
    except Exception as exc:
        logger.warning("UV 补 users 行失败（已忽略）：%s", exc)
        try:
            conn.rollback()
        except Exception:
            pass



def _upsert_uv_v2(
    conn,
    *,
    visit_day,
    fingerprint: str,
    user_id: str | None,
    legacy_key: str,
    user_code: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO daily_active_visitors (
          visit_date, device_fingerprint, user_id, visitor_key,
          user_bound_at, updated_at, user_code
        )
        VALUES (
          %s, %s, %s, %s,
          CASE WHEN %s IS NOT NULL THEN now() ELSE NULL END,
          now(), %s
        )
        ON CONFLICT (visit_date, device_fingerprint)
        DO UPDATE SET
          user_id = COALESCE(EXCLUDED.user_id, daily_active_visitors.user_id),
          user_code = COALESCE(EXCLUDED.user_code, daily_active_visitors.user_code),
          user_bound_at = COALESCE(
            daily_active_visitors.user_bound_at,
            CASE WHEN EXCLUDED.user_id IS NOT NULL THEN now() ELSE NULL END
          ),
          visitor_key = CASE
            WHEN EXCLUDED.user_id IS NOT NULL THEN 'u:' || EXCLUDED.user_id::text
            ELSE daily_active_visitors.visitor_key
          END,
          updated_at = now()
        """,
        (visit_day, fingerprint, user_id, legacy_key, user_id, user_code),
    )


def _upsert_uv_by_visitor_key(
    conn,
    *,
    visit_day,
    fingerprint: str,
    user_id: str | None,
    legacy_key: str,
    user_code: str | None = None,
) -> None:
    """当 (visit_date, device_fingerprint) 唯一索引缺失时，退回旧 PK 幂等。"""
    if _has_uv_v2(conn):
        conn.execute(
            """
            INSERT INTO daily_active_visitors (
              visit_date, device_fingerprint, user_id, visitor_key,
              user_bound_at, updated_at, user_code
            )
            VALUES (
              %s, %s, %s, %s,
              CASE WHEN %s IS NOT NULL THEN now() ELSE NULL END,
              now(), %s
            )
            ON CONFLICT (visit_date, visitor_key)
            DO UPDATE SET
              device_fingerprint = COALESCE(
                daily_active_visitors.device_fingerprint, EXCLUDED.device_fingerprint
              ),
              user_id = COALESCE(EXCLUDED.user_id, daily_active_visitors.user_id),
              user_code = COALESCE(EXCLUDED.user_code, daily_active_visitors.user_code),
              user_bound_at = COALESCE(
                daily_active_visitors.user_bound_at,
                CASE WHEN EXCLUDED.user_id IS NOT NULL THEN now() ELSE NULL END
              ),
              updated_at = now()
            """,
            (visit_day, fingerprint, user_id, legacy_key, user_id, user_code),
        )
        return
    conn.execute(
        """
        INSERT INTO daily_active_visitors (visit_date, visitor_key)
        VALUES (%s, %s)
        ON CONFLICT (visit_date, visitor_key) DO NOTHING
        """,
        (visit_day, legacy_key),
    )


def _insert_legacy_only(
    conn,
    *,
    visit_day,
    legacy_key: str,
    fingerprint: str | None = None,
) -> None:
    """最后兜底：一律带上 device_fingerprint（V2 列为 NOT NULL）。"""
    if _has_uv_v2(conn):
        fp = fingerprint or (
            legacy_key[2:] if legacy_key.startswith(("d:", "u:")) else legacy_key
        )
        conn.execute(
            """
            INSERT INTO daily_active_visitors (
              visit_date, visitor_key, device_fingerprint, updated_at
            )
            VALUES (%s, %s, %s, now())
            ON CONFLICT (visit_date, visitor_key) DO UPDATE SET
              device_fingerprint = COALESCE(
                daily_active_visitors.device_fingerprint, EXCLUDED.device_fingerprint
              ),
              updated_at = now()
            """,
            (visit_day, legacy_key, fp),
        )
        return
    conn.execute(
        """
        INSERT INTO daily_active_visitors (visit_date, visitor_key)
        VALUES (%s, %s)
        ON CONFLICT (visit_date, visitor_key) DO NOTHING
        """,
        (visit_day, legacy_key),
    )


def record_daily_visit(
    *,
    user_id: str | None,
    device_id: str | None,
    user_code: str | None = None,
) -> bool:
    """写入今日 UV。返回是否成功落库（或已存在幂等）。"""
    fingerprint = resolve_device_fingerprint(user_id=user_id, device_id=device_id)
    if not fingerprint:
        _set_err("missing fingerprint")
        return False
    visit_day = china_today()
    legacy_key = legacy_visitor_key(user_id=user_id, device_id=device_id) or f"d:{fingerprint}"
    code = (user_code or "").strip() or None
    try:
        from ..db import get_pool

        pool = get_pool()
        with pool.connection() as conn:
            if not _table_exists(conn) or not _has_uv_v2(conn) or not _has_device_unique(conn):
                try:
                    ensure_uv_schema(conn)
                except Exception as exc:
                    logger.warning("UV schema ensure 失败：%s", exc)
                    try:
                        conn.rollback()
                    except Exception:
                        pass

            if _has_uv_v2(conn):
                effective_user_id = user_id
                if not effective_user_id:
                    effective_user_id = _lookup_bound_user_id(conn, fingerprint)
                if effective_user_id:
                    _ensure_users_row(conn, effective_user_id)

                def _try_write(uid: str | None) -> None:
                    key = legacy_visitor_key(user_id=uid, device_id=device_id) or f"d:{fingerprint}"
                    _upsert_uv_by_visitor_key(
                        conn,
                        visit_day=visit_day,
                        fingerprint=fingerprint,
                        user_id=uid,
                        legacy_key=key,
                        user_code=code,
                    )
                    if _has_device_unique(conn) and uid:
                        try:
                            _upsert_uv_v2(
                                conn,
                                visit_day=visit_day,
                                fingerprint=fingerprint,
                                user_id=uid,
                                legacy_key=key,
                                user_code=code,
                            )
                        except Exception as exc:
                            logger.warning("UV 设备维合并失败（visitor_key 已写入）：%s", exc)

                try:
                    _try_write(effective_user_id)
                    conn.commit()
                    _set_err(None)
                    return True
                except Exception as exc:
                    conn.rollback()
                    logger.warning("UV V2 写入失败，尝试降级：%s", exc)
                    try:
                        if "user_code" in str(exc).lower():
                            ensure_uv_schema(conn)
                        _try_write(None)
                        conn.commit()
                        _set_err(None)
                        return True
                    except Exception as exc2:
                        conn.rollback()
                        logger.warning("UV 降级仍失败，尝试兜底写入：%s", exc2)
                        try:
                            _insert_legacy_only(
                                conn,
                                visit_day=visit_day,
                                legacy_key=legacy_key,
                                fingerprint=fingerprint,
                            )
                            conn.commit()
                            _set_err(None)
                            return True
                        except Exception as exc3:
                            conn.rollback()
                            _set_err(str(exc3))
                            logger.warning("UV 最终写入失败（已忽略）：%s", exc3)
                            return False
            else:
                _insert_legacy_only(
                    conn,
                    visit_day=visit_day,
                    legacy_key=legacy_key,
                    fingerprint=fingerprint,
                )
                conn.commit()
                _set_err(None)
                return True
    except Exception as exc:
        _set_err(str(exc))
        logger.warning("UV 记录失败（已忽略）：%s", exc)
        return False
