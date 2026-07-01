"""同步引擎纯逻辑单测（冲突解决 + 注册表 + 信封键提取），不依赖 PG。"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.sync.conflict import should_apply  # noqa: E402
from app.sync.engine import _keyvals  # noqa: E402
from app.sync.registry import REGISTRY, get_spec  # noqa: E402

T0 = datetime(2026, 6, 29, 12, 0, tzinfo=timezone.utc)
T1 = T0 + timedelta(seconds=10)


def test_should_apply_new_row():
    assert should_apply(None, None, T0, 1) is True


def test_should_apply_lww_newer_wins():
    assert should_apply(T0, 1, T1, 1) is True
    assert should_apply(T1, 1, T0, 1) is False


def test_should_apply_same_ts_version_tiebreak():
    assert should_apply(T0, 2, T0, 3) is True
    assert should_apply(T0, 3, T0, 2) is False
    assert should_apply(T0, 2, T0, 2) is True  # 幂等覆盖


def test_should_apply_incoming_no_ts_needs_higher_version():
    assert should_apply(T0, 1, None, 2) is True
    assert should_apply(T0, 2, None, 1) is False


def test_registry_specs_consistent():
    for name, spec in REGISTRY.items():
        assert spec.entity == name
        # 业务键应包含在主键内（id 实体或复合键）
        if spec.id_based:
            assert spec.pk_cols == ("id",)
        else:
            assert "user_id" in spec.pk_cols
        for jc in spec.json_cols:
            assert jc in spec.data_cols
        for ac in spec.array_cols:
            assert ac in spec.data_cols


def test_keyvals_id_entity():
    spec = get_spec("note")
    kv = _keyvals(spec, {"entity": "note", "id": "abc", "data": {"body": "hi"}})
    assert kv == {"id": "abc"}


def test_keyvals_composite_entity():
    spec = get_spec("plan_progress")
    kv = _keyvals(spec, {"entity": "plan_progress", "keys": {"plan_id": "p1"}, "data": {"day": 3}})
    assert kv == {"plan_id": "p1"}
