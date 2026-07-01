"""增量同步引擎：基于 registry 的通用 push/pull。

- 写入统一重取 server_seq=nextval('user_data_seq')，使多端 pull 能看到最新变更
- 冲突：行级 LWW（见 conflict.should_apply）
- 删除：versioned→软删 tombstone；非 versioned→物理删
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from ..db import get_pool
from .conflict import should_apply
from .registry import REGISTRY, EntitySpec, get_spec

logger = logging.getLogger(__name__)

PULL_DEFAULT_LIMIT = 500


def _parse_ts(val: Any) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except ValueError:
        return None


# ── PULL ──────────────────────────────────────────────────────────────────
def _row_to_change(spec: EntitySpec, cols: list[str], row: tuple) -> dict:
    rec = dict(zip(cols, row))
    data = {c: rec.get(c) for c in spec.data_cols}
    keys = {c: rec.get(c) for c in spec.key_cols}
    deleted = bool(rec.get("deleted")) if spec.versioned else False
    out = {
        "entity": spec.entity,
        "op": "delete" if deleted else "update",
        "keys": keys,
        "data": data,
        "version": rec.get("version") if spec.versioned else None,
        "updated_at": rec.get("updated_at").isoformat() if rec.get("updated_at") else None,
        "server_seq": rec.get("server_seq"),
    }
    if spec.id_based:
        out["id"] = str(rec.get("id"))
    return out


def pull(user_id: str, since: int, entities: list[str] | None, limit: int = PULL_DEFAULT_LIMIT) -> dict:
    specs = [REGISTRY[e] for e in (entities or REGISTRY.keys()) if e in REGISTRY]
    collected: list[dict] = []
    pool = get_pool()
    with pool.connection() as conn:
        for spec in specs:
            sel = ["server_seq", "updated_at"]
            sel += list(spec.key_cols)
            sel += list(spec.data_cols)
            if spec.versioned:
                sel += ["version", "deleted"]
            if spec.id_based and "id" not in sel:
                sel.append("id")
            col_sql = ", ".join(dict.fromkeys(sel))
            rows = conn.execute(
                f"SELECT {col_sql} FROM {spec.table} "
                f"WHERE user_id = %s AND server_seq > %s ORDER BY server_seq LIMIT %s",
                (user_id, since, limit + 1),
            ).fetchall()
            cols = list(dict.fromkeys(sel))
            for r in rows:
                collected.append(_row_to_change(spec, cols, r))
    collected.sort(key=lambda c: c["server_seq"])
    has_more = len(collected) > limit
    page = collected[:limit]
    cursor = page[-1]["server_seq"] if page else since
    return {"changes": page, "cursor": cursor, "has_more": has_more}


# ── PUSH ──────────────────────────────────────────────────────────────────
def _existing(conn, spec: EntitySpec, user_id: str, keyvals: dict) -> tuple[datetime | None, int | None]:
    where, params = ["user_id = %s"], [user_id]
    for k in spec.key_cols:
        where.append(f"{k} = %s")
        params.append(keyvals.get(k))
    sel = "client_ts, version" if spec.versioned else "client_ts"
    row = conn.execute(
        f"SELECT {sel} FROM {spec.table} WHERE {' AND '.join(where)}",
        tuple(params),
    ).fetchone()
    if not row:
        return None, None
    return (row[0], row[1] if spec.versioned else None)


def _keyvals(spec: EntitySpec, change: dict) -> dict:
    data = change.get("data") or {}
    kv: dict = {}
    for k in spec.key_cols:
        if k == "id":
            kv["id"] = change.get("id") or data.get("id")
        else:
            kv[k] = change.get("keys", {}).get(k, data.get(k))
    return kv


def _col_placeholder(spec: EntitySpec, col: str) -> str:
    if col in spec.json_cols:
        return "%s::jsonb"
    return "%s"


def _col_value(spec: EntitySpec, col: str, value: Any) -> Any:
    if col in spec.json_cols and value is not None:
        return json.dumps(value, ensure_ascii=False)
    return value


def _upsert(conn, spec: EntitySpec, user_id: str, change: dict, device_id: str | None) -> None:
    data = change.get("data") or {}
    keyvals = _keyvals(spec, change)
    is_delete = change.get("op") == "delete"
    client_ts = change.get("client_ts")
    version = int(change.get("version") or 1)

    # 物理删（非 versioned）
    if is_delete and not spec.versioned:
        where, params = ["user_id = %s"], [user_id]
        for k in spec.key_cols:
            where.append(f"{k} = %s")
            params.append(keyvals.get(k))
        conn.execute(f"DELETE FROM {spec.table} WHERE {' AND '.join(where)}", tuple(params))
        return

    cols: list[str] = ["user_id"]
    ph: list[str] = ["%s"]
    vals: list[Any] = [user_id]

    for k in spec.key_cols:
        cols.append(k)
        ph.append("%s")
        vals.append(keyvals.get(k))

    # 删除时不写业务数据列，避免清空
    write_data = [] if is_delete else list(spec.data_cols)
    for c in write_data:
        cols.append(c)
        ph.append(_col_placeholder(spec, c))
        vals.append(_col_value(spec, c, data.get(c)))

    if spec.versioned:
        cols += ["version", "deleted"]
        ph += ["%s", "%s"]
        vals += [version, is_delete]

    cols += ["server_seq", "updated_at", "device_id", "client_ts"]
    ph += ["nextval('user_data_seq')", "now()", "%s", "%s::timestamptz"]
    vals += [device_id, client_ts]

    update_cols = [c for c in cols if c not in spec.pk_cols and c != "user_id"]
    set_sql = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
    conflict_target = ", ".join(spec.pk_cols)
    guard = "" if "user_id" in spec.pk_cols else f" WHERE {spec.table}.user_id = EXCLUDED.user_id"

    sql = (
        f"INSERT INTO {spec.table} ({', '.join(cols)}) VALUES ({', '.join(ph)}) "
        f"ON CONFLICT ({conflict_target}) DO UPDATE SET {set_sql}{guard}"
    )
    conn.execute(sql, tuple(vals))


def push(user_id: str, changes: list[dict], device_id: str | None) -> dict:
    applied, skipped, errors = 0, 0, []
    pool = get_pool()
    with pool.connection() as conn:
        for change in changes:
            spec = get_spec(change.get("entity"))
            if not spec:
                errors.append({"entity": change.get("entity"), "error": "unknown_entity"})
                continue
            try:
                keyvals = _keyvals(spec, change)
                ex_ts, ex_ver = _existing(conn, spec, user_id, keyvals)
                inc_ts = _parse_ts(change.get("client_ts"))
                inc_ver = int(change.get("version") or 1)
                if not should_apply(ex_ts, ex_ver, inc_ts, inc_ver):
                    skipped += 1
                    continue
                _upsert(conn, spec, user_id, change, device_id)
                applied += 1
            except Exception as exc:
                logger.exception("push 失败 entity=%s", change.get("entity"))
                errors.append({"entity": change.get("entity"), "error": str(exc)})
        conn.commit()
    return {"applied": applied, "skipped": skipped, "errors": errors}
