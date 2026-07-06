"""RAG 源文件路径规范化与匹配键。"""
from __future__ import annotations

from pathlib import Path

from ..config import REPO_ROOT

_CONTENT_MARKER = "content/commentary/"


def commentary_root() -> Path:
    return REPO_ROOT / "content" / "commentary"


def commentary_relative_path(path: str | Path) -> str | None:
    """提取 content/commentary/... 相对键，跨 /app、/opt/bible 等部署路径对齐。"""
    raw = str(path).replace("\\", "/")
    lower = raw.lower()
    idx = lower.find(_CONTENT_MARKER)
    if idx < 0:
        return None
    return raw[idx:].replace("\\", "/")


def commentary_subpath(path: str | Path) -> str | None:
    """commentary 根目录下的相对路径，如 public-domain-ocd/foo.md。"""
    rel = commentary_relative_path(path)
    if not rel:
        return None
    return rel[len(_CONTENT_MARKER) :]


def storage_source_path(path: str | Path) -> str:
    """入库用稳定路径：优先 content/commentary/...。"""
    rel = commentary_relative_path(path)
    if rel:
        return rel
    p = Path(path)
    root = commentary_root()
    try:
        return str(p.resolve().relative_to(root.resolve()))
    except (OSError, ValueError):
        return normalize_source_path(path)


def normalize_source_path(path: str | Path) -> str:
    """统一为当前环境可访问的绝对路径。"""
    raw = str(path).strip()
    if not raw:
        return raw
    p = Path(raw)
    sub = commentary_subpath(raw)
    if sub:
        candidate = (commentary_root() / sub).resolve()
        if candidate.is_file() or candidate.parent.is_dir():
            return str(candidate)
    if p.is_absolute():
        try:
            resolved = str(p.resolve())
            if Path(resolved).is_file():
                return resolved
        except OSError:
            return raw
    for base in (REPO_ROOT, commentary_root()):
        candidate = (base / p).resolve()
        if candidate.is_file() or candidate.parent.is_dir():
            return str(candidate)
    try:
        return str(p.resolve())
    except OSError:
        return raw


def path_match_keys(path: str | Path, *, commentary: Path | None = None) -> set[str]:
    """生成用于磁盘文件 ↔ 数据库记录匹配的键集合。"""
    root = commentary or commentary_root()
    keys: set[str] = set()
    p = Path(path)
    for candidate in (path, normalize_source_path(path)):
        rel_content = commentary_relative_path(candidate)
        if rel_content:
            keys.add(rel_content)
            sub = commentary_subpath(candidate)
            if sub:
                keys.add(sub)
    try:
        resolved = p.resolve()
        keys.add(str(resolved))
        try:
            keys.add(str(resolved.relative_to(root.resolve())))
        except ValueError:
            pass
        try:
            keys.add(str(resolved.relative_to(REPO_ROOT.resolve())))
        except ValueError:
            pass
    except OSError:
        keys.add(str(p))
    keys.add(p.name)
    return {k for k in keys if k}
