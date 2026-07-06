"""RAG 源文件路径规范化与匹配键。"""
from __future__ import annotations

from pathlib import Path

from ..config import REPO_ROOT


def commentary_root() -> Path:
    return REPO_ROOT / "content" / "commentary"


def normalize_source_path(path: str | Path) -> str:
    """统一为绝对路径；相对路径优先按仓库根解析。"""
    raw = str(path).strip()
    if not raw:
        return raw
    p = Path(raw)
    if p.is_absolute():
        try:
            return str(p.resolve())
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
