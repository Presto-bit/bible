#!/usr/bin/env bash
# 公版注释 + 中文资料 + RAG 索引（管理后台 / 本地手动执行，发版不再自动调用）。
#
# 用法（仓库根目录 / 容器内 /app）：
#   bash scripts/ensure_rag.sh
#   SKIP_COMMENTARY_IMPORT=1 bash scripts/ensure_rag.sh   # 仅索引，不拉远程
#   RAG_FORCE=1 bash scripts/ensure_rag.sh                # 强制重嵌入
#
# Docker（管理后台触发或手动）：
#   docker compose -f docker-compose.prod.yml exec -T api bash /app/scripts/ensure_rag.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  PY=python
fi
SKIP_IMPORT="${SKIP_COMMENTARY_IMPORT:-0}"
FORCE="${RAG_FORCE:-0}"
PD_DIR="$ROOT/content/commentary/public-domain"
OCD_DIR="$ROOT/content/commentary/public-domain-ocd"
REF_DIR="$ROOT/content/commentary/reference-en"
ZH_DIR="$ROOT/content/commentary/study-bible-zh"
FHL_DIR="$ROOT/content/commentary/fhl-zh"
STUDY_DIR="$ROOT/content/commentary/study-bible"

log() { echo "[ensure-rag] $*"; }

mkdir -p "$PD_DIR" "$OCD_DIR" "$REF_DIR" "$ZH_DIR" "$FHL_DIR" "$STUDY_DIR"

index_dir() {
  local dir="$1"
  local source_type="$2"
  if [[ ! -d "$dir" ]]; then
    log "跳过索引（目录不存在）: $dir"
    return 0
  fi
  local n
  n="$(find "$dir" \( -name '*.md' -o -name '*.txt' \) | wc -l | tr -d ' ')"
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

# OCD 按子目录分批，降低单次进程内存峰值
index_ocd_dir() {
  local dir="$1"
  local source_type="$2"
  if [[ ! -d "$dir" ]]; then
    return 0
  fi
  local subdirs=("$dir"/*/)
  if [[ ! -e "${subdirs[0]}" ]]; then
    index_dir "$dir" "$source_type"
    return $?
  fi
  local ok=1
  for sub in "${subdirs[@]}"; do
    [[ -d "$sub" ]] || continue
    index_dir "$sub" "$source_type" || ok=0
  done
  return "$ok"
}

# ── 1. 英文公版注释（HelloAO 全源 + OpenChristianData）──
if [[ "$SKIP_IMPORT" != "1" ]]; then
  log "HelloAO 公版注释（6 源 × 66 卷，已齐全跳过）…"
  if "$PY" "$ROOT/scripts/import_commentary_pd.py" --all-sources --skip-existing; then
    log "✓ HelloAO 注释就绪"
  else
    log "⚠ HelloAO 拉取失败（不可达时不影响发版）"
  fi

  log "OpenChristianData 公版注释/参考（已存在跳过）…"
  if "$PY" "$ROOT/scripts/import_commentary_ocd.py" --skip-existing; then
    log "✓ OCD 资料就绪"
  else
    log "⚠ OCD 拉取失败"
  fi
else
  log "跳过英文注释拉取（SKIP_COMMENTARY_IMPORT=1）"
fi

# ── 2. 中文自有资料 + 信望爱注释 ──
log "生成中文自有 RAG 资料…"
"$PY" "$ROOT/scripts/build_rag_zh_content.py"

if [[ "$SKIP_IMPORT" != "1" ]]; then
  log "信望爱站注释（book=3，已齐全跳过）…"
  if "$PY" "$ROOT/scripts/import_fhl_commentary.py" --skip-existing; then
    log "✓ FHL 中文注释就绪"
  else
    log "⚠ FHL 注释拉取失败"
  fi
else
  log "跳过 FHL 拉取（SKIP_COMMENTARY_IMPORT=1）"
fi

# ── 3. RAG 索引（hash 未变则跳过；--reuse 复用已有向量）──
ok=0
index_dir "$STUDY_DIR" "study-bible" && ok=$((ok + 1)) || true
index_dir "$PD_DIR" "commentary" && ok=$((ok + 1)) || true
index_ocd_dir "$OCD_DIR" "commentary" && ok=$((ok + 1)) || true
index_dir "$REF_DIR" "reference-en" && ok=$((ok + 1)) || true
index_dir "$ZH_DIR" "study-bible-zh" && ok=$((ok + 1)) || true
index_dir "$FHL_DIR" "commentary-zh" && ok=$((ok + 1)) || true

if [[ "$ok" -eq 0 ]]; then
  log "⚠ 未完成任何 RAG 索引"
  exit 0
fi

log "RAG 资料检查完成（$ok 类来源）"
exit 0
