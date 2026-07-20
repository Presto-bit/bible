"""增量同步引擎：基于 registry 的通用 push/pull。

- 写入统一重取 server_seq=nextval('user_data_seq')，使多端 pull 能看到最新变更
- 冲突：行级 LWW（见 conflict.should_apply）
- 删除：versioned→软删 tombstone；非 versioned→物理删
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
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


def _jsonable(val: Any) -> Any:
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    return val


# ── PULL ──────────────────────────────────────────────────────────────────
def _row_to_change(spec: EntitySpec, cols: list[str], row: tuple) -> dict:
    rec = dict(zip(cols, row))
    data = {c: _jsonable(rec.get(c)) for c in spec.data_cols}
    keys = {c: _jsonable(rec.get(c)) for c in spec.key_cols}
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
            try:
                rows = conn.execute(
                    f"SELECT {col_sql} FROM {spec.table} "
                    f"WHERE user_id = %s AND server_seq > %s ORDER BY server_seq LIMIT %s",
                    (user_id, since, limit + 1),
                ).fetchall()
            except Exception as exc:
                # 缺表/缺列时跳过该实体，避免整次 pull 500（部署漏跑迁移时常见）
                logger.exception("pull 跳过 entity=%s table=%s: %s", spec.entity, spec.table, exc)
                try:
                    conn.rollback()
                except Exception:
                    pass
                continue
            cols = list(dict.fromkeys(sel))
            for r in rows:
                collected.append(_row_to_change(spec, cols, r))
    collected.sort(key=lambda c: c["server_seq"])
    has_more = len(collected) > limit
    page = collected[:limit]
    cursor = page[-1]["server_seq"] if page else since
    return {"changes": page, "cursor": cursor, "has_more": has_more}


def reading_state(user_id: str) -> dict:
    """按用户一次性返回读经相关全量（不走增量分页，专供重装/换端恢复）。"""
    pool = get_pool()
    logs: list = []
    progress = None
    events: list = []
    with pool.connection() as conn:
        try:
            logs = conn.execute(
                "SELECT date, minutes, chapters FROM reading_log WHERE user_id = %s ORDER BY date",
                (user_id,),
            ).fetchall()
        except Exception as exc:
            logger.exception("reading_state reading_log 失败: %s", exc)
            try:
                conn.rollback()
            except Exception:
                pass
        try:
            progress = conn.execute(
                "SELECT book, chapter, verse, updated_at FROM reading_progress WHERE user_id = %s",
                (user_id,),
            ).fetchone()
        except Exception as exc:
            logger.exception("reading_state reading_progress 失败: %s", exc)
            try:
                conn.rollback()
            except Exception:
                pass
        try:
            events = conn.execute(
                """
                SELECT id, ts, book, chapter FROM read_event
                WHERE user_id = %s AND deleted = false
                ORDER BY ts DESC
                LIMIT 2000
                """,
                (user_id,),
            ).fetchall()
        except Exception as exc:
            logger.exception("reading_state read_event 失败（可能未建表）: %s", exc)
            try:
                conn.rollback()
            except Exception:
                pass
    return {
        "reading_log": [
            {
                "date": _jsonable(r[0]),
                "minutes": int(r[1] or 0),
                "chapters": int(r[2] or 0),
            }
            for r in logs
        ],
        "reading_progress": (
            {
                "book": progress[0],
                "chapter": int(progress[1] or 0),
                "verse": int(progress[2] or 1),
                "updated_at": progress[3].isoformat() if progress[3] else None,
            }
            if progress
            else None
        ),
        "read_events": [
            {
                "id": str(r[0]),
                "ts": int(r[1] or 0),
                "book": r[2],
                "chapter": int(r[3] or 0),
            }
            for r in events
        ],
    }

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


def _merge_reading_log_change(
    conn,
    user_id: str,
    change: dict,
) -> tuple[dict, bool]:
    """reading_log 按日合并：minutes/chapters 取较大值，避免 LWW 覆盖丢数据。"""
    keys = change.get("keys") or {}
    date = keys.get("date")
    if not date:
        return change, True
    row = conn.execute(
        "SELECT minutes, chapters, client_ts FROM reading_log WHERE user_id = %s AND date = %s",
        (user_id, date),
    ).fetchone()
    data = dict(change.get("data") or {})
    inc_m = int(data.get("minutes") or 0)
    inc_c = int(data.get("chapters") or 0)
    if not row:
        return {**change, "data": {"minutes": inc_m, "chapters": inc_c}}, True
    ex_m, ex_c, ex_ts = int(row[0] or 0), int(row[1] or 0), row[2]
    merged_m = max(ex_m, inc_m)
    merged_c = max(ex_c, inc_c)
    merged = {**change, "data": {"minutes": merged_m, "chapters": merged_c}}
    if merged_m > ex_m or merged_c > ex_c:
        return merged, True
    inc_ts = _parse_ts(change.get("client_ts"))
    if not should_apply(ex_ts, None, inc_ts, None):
        return merged, False
    return merged, True


def _merge_reading_progress_change(
    conn,
    user_id: str,
    change: dict,
) -> tuple[dict, bool]:
    """reading_progress：同卷取更远章/节；跨卷按 client_ts（当前书签，不用正典序）。"""
    data = dict(change.get("data") or {})
    inc_book = data.get("book")
    inc_ch = int(data.get("chapter") or 0)
    inc_v = int(data.get("verse") or 1)
    if not inc_book or inc_ch < 1:
        return change, True
    row = conn.execute(
        "SELECT book, chapter, verse, client_ts FROM reading_progress WHERE user_id = %s",
        (user_id,),
    ).fetchone()
    if not row:
        return change, True
    ex_book, ex_ch, ex_v, ex_ts = row[0], int(row[1] or 0), int(row[2] or 1), row[3]
    if inc_book.upper() == (ex_book or "").upper():
        if inc_ch > ex_ch or (inc_ch == ex_ch and inc_v > ex_v):
            return change, True
        if inc_ch < ex_ch or (inc_ch == ex_ch and inc_v < ex_v):
            return change, False
        return change, False
    # 跨卷：时间戳更新才覆盖，避免罗马书进度盖掉创世记当前阅读
    inc_ts = _parse_ts(change.get("client_ts"))
    if not should_apply(ex_ts, None, inc_ts, None):
        return change, False
    return change, True


def _merge_badge_unlock_change(conn, user_id: str, change: dict) -> dict:
    """badge_unlock：unlocked_at 取较早时间（首次解锁为准）。"""
    badge_id = change.get("id") or (change.get("data") or {}).get("badge_id")
    if not badge_id:
        return change
    row = conn.execute(
        "SELECT unlocked_at FROM badge_unlock WHERE user_id = %s AND id = %s AND deleted = false",
        (user_id, badge_id),
    ).fetchone()
    data = dict(change.get("data") or {})
    inc_at = int(data.get("unlocked_at") or 0)
    if not row:
        data.setdefault("badge_id", badge_id)
        return {**change, "data": data}
    ex_at = int(row[0] or 0)
    data["badge_id"] = badge_id
    data["unlocked_at"] = min(ex_at, inc_at) if ex_at and inc_at else (ex_at or inc_at)
    return {**change, "data": data}


def push(user_id: str, changes: list[dict], device_id: str | None) -> dict:
    applied, skipped, errors = 0, 0, []
    pool = get_pool()
    with pool.connection() as conn:
        for idx, change in enumerate(changes):
            spec = get_spec(change.get("entity"))
            if not spec:
                errors.append({
                    "index": idx,
                    "entity": change.get("entity"),
                    "error": "unknown_entity",
                })
                continue
            try:
                keyvals = _keyvals(spec, change)
                if spec.entity == "reading_log":
                    change, apply = _merge_reading_log_change(conn, user_id, change)
                    if not apply:
                        skipped += 1
                        continue
                elif spec.entity == "reading_progress":
                    change, apply = _merge_reading_progress_change(conn, user_id, change)
                    if not apply:
                        skipped += 1
                        continue
                elif spec.entity == "badge_unlock":
                    # 徽章仅服务端/受信逻辑写入，忽略客户端自授
                    skipped += 1
                    continue
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
                errors.append({
                    "index": idx,
                    "entity": change.get("entity"),
                    "error": str(exc),
                })
        conn.commit()
    return {"applied": applied, "skipped": skipped, "errors": errors}
