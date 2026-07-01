#!/usr/bin/env bash
# 清理本地构建产物、缓存与 OS 垃圾文件（不删 node_modules / .venv，除非 CLEAN_DEPS=1）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[clean] $*"; }

# macOS / Windows
find "$ROOT" -name '.DS_Store' -delete 2>/dev/null || true
find "$ROOT" -name 'Thumbs.db' -delete 2>/dev/null || true

# Python
find "$ROOT" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
find "$ROOT" -type d -name '.pytest_cache' -prune -exec rm -rf {} + 2>/dev/null || true
find "$ROOT" -type d -name '*.egg-info' -prune -exec rm -rf {} + 2>/dev/null || true
find "$ROOT" -name '*.pyc' -delete 2>/dev/null || true

# Next.js / TypeScript
rm -rf "$ROOT/apps/web/.next" 2>/dev/null || true
rm -f "$ROOT/apps/web/tsconfig.tsbuildinfo" 2>/dev/null || true

# Flutter
rm -rf "$ROOT/apps/mobile/build" 2>/dev/null || true
rm -rf "$ROOT/apps/mobile/.dart_tool" 2>/dev/null || true

# 本地生成的 SQLite / WAL（由 scripts/import_bible.py 重建）
rm -f "$ROOT/build/"*.sqlite "$ROOT/build/"*.sqlite-shm "$ROOT/build/"*.sqlite-wal 2>/dev/null || true
rm -rf "$ROOT/build/offline_pack" 2>/dev/null || true

# RAG 注释提取缓存（由 scripts/commentary_to_md.py 从 data/commentary 重建）
rm -rf "$ROOT/content/commentary/extracted" 2>/dev/null || true
mkdir -p "$ROOT/content/commentary/extracted"

# 可选：依赖目录（体积大，重装需 npm install / python -m venv）
if [[ "${CLEAN_DEPS:-0}" == "1" ]]; then
  log "CLEAN_DEPS=1：删除 node_modules 与 .venv"
  rm -rf "$ROOT/apps/web/node_modules" "$ROOT/services/api/.venv" 2>/dev/null || true
fi

log "完成。保留：data/、node_modules（默认）、.venv（默认）、deploy/*.env 本地密钥。"
