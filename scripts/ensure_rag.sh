#!/usr/bin/env bash
# 公版注释全卷拉取 + RAG 索引（发版幂等，可重复执行）。
#
# 用法（仓库根目录 / 容器内 /app）：
#   bash scripts/ensure_rag.sh
#   SKIP_COMMENTARY_IMPORT=1 bash scripts/ensure_rag.sh   # 仅索引，不拉 HelloAO
#   RAG_FORCE=1 bash scripts/ensure_rag.sh                # 强制重嵌入
#
# Docker 发版（release.sh 自动调用）：
#   docker compose -f docker-compose.prod.yml exec -T api bash /app/scripts/ensure_rag.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python}"
SKIP_IMPORT="${SKIP_COMMENTARY_IMPORT:-0}"
FORCE="${RAG_FORCE:-0}"
PD_DIR="$ROOT/content/commentary/public-domain"
STUDY_DIR="$ROOT/content/commentary/study-bible"

log() { echo "[ensure-rag] $*"; }

index_dir() {
  local dir="$1"
  local source_type="$2"
  if [[ ! -d "$dir" ]]; then
    log "跳过索引（目录不存在）: $dir"
    return 0
  fi
  local n
  n="$(find "$dir" -maxdepth 1 \( -name '*.md' -o -name '*.txt' \) | wc -l | tr -d ' ')"
  if [[ "$n" -eq 0 ]]; then
    log "跳过索引（无 md/txt）: $dir"
    return 0
  fi
  local args=(--dir "$dir" --source-type "$source_type" --reuse)
  if [[ "$FORCE" == "1" ]]; then
    args+=(--force)
  fi
  log "索引 $source_type（$n 个文件）…"
  if "$PY" "$ROOT/scripts/rag_index.py" "${args[@]}"; then
    log "✓ $source_type 索引完成"
  else
    log "⚠ $source_type 索引失败（无 Key/网络时不影响发版）"
    return 1
  fi
}

# ── 1. 公版注释全卷（HelloAO，已齐全则跳过）──
if [[ "$SKIP_IMPORT" != "1" ]]; then
  log "拉取公版注释全卷（Matthew Henry，已齐全跳过）…"
  if "$PY" "$ROOT/scripts/import_commentary_pd.py" --skip-existing; then
    log "✓ 公版注释就绪"
  else
    log "⚠ 公版注释拉取失败（HelloAO 不可达时不影响发版）"
  fi
else
  log "跳过注释拉取（SKIP_COMMENTARY_IMPORT=1）"
fi

# ── 2. RAG 索引（hash 未变则跳过；--reuse 复用已有向量）──
ok=0
index_dir "$STUDY_DIR" "study-bible" && ok=$((ok + 1)) || true
index_dir "$PD_DIR" "commentary" && ok=$((ok + 1)) || true

if [[ "$ok" -eq 0 ]]; then
  log "⚠ 未完成任何 RAG 索引"
  exit 0
fi

log "内容数据 RAG 检查完成"
exit 0
