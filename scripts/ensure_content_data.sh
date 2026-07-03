#!/usr/bin/env bash
# 确保 API 所需的 SQLite 经库与内容库已生成（幂等，可重复执行）。
#
# 用法（仓库根目录）：
#   bash scripts/ensure_content_data.sh
#   APP_DIR=/opt/bible bash scripts/ensure_content_data.sh
#
# Docker 发版后：
#   docker compose -f docker-compose.prod.yml exec -T api bash /app/scripts/ensure_content_data.sh
#
# 说明：
#   - JSON/CSV 随 git pull 进入镜像，无需手工上传
#   - crossrefs.sqlite / strongs.sqlite / bible_cuvs.sqlite 体积大，不入 git，在此脚本生成
#   - 首次或缺失时会从 OpenBible / Gnosis / midvash 拉取（需网络）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python}"
CACHE="$ROOT/data/.cache"
mkdir -p "$CACHE"

log() { echo "[ensure-data] $*"; }

need_run() {
  local out="$1"
  shift
  for src in "$@"; do
    if [[ ! -f "$out" ]]; then
      return 0
    fi
    if [[ -f "$src" && "$src" -nt "$out" ]]; then
      return 0
    fi
  done
  return 1
}

fetch_if_missing() {
  local url="$1"
  local dest="$2"
  if [[ -f "$dest" && -s "$dest" ]]; then
    return 0
  fi
  log "下载 $(basename "$dest") …"
  curl -fsSL --connect-timeout 30 --max-time 600 -o "$dest" "$url"
}

# ── 交叉引用（OpenBible → data/crossrefs/cross_references.sqlite）──
CROSS_SQL="$ROOT/data/crossrefs/cross_references.sqlite"
CROSS_ZIP="$CACHE/crossrefs.zip"
if need_run "$CROSS_SQL" "$ROOT/scripts/import_crossrefs.py" "$ROOT/data/crossrefs/cross_references.json"; then
  fetch_if_missing "https://a.openbible.info/data/cross-references.zip" "$CROSS_ZIP"
  "$PY" "$ROOT/scripts/import_crossrefs.py" --zip "$CROSS_ZIP"
else
  log "交叉引用 SQLite 已就绪"
fi

# ── Strong's 逐词（Gnosis greek-words → data/strongs/strongs.sqlite）──
STRONGS_SQL="$ROOT/data/strongs/strongs.sqlite"
GNOSIS_GREEK="$CACHE/gnosis-greek-words.json"
if need_run "$STRONGS_SQL" "$ROOT/scripts/import_strongs_gnosis.py"; then
  fetch_if_missing \
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/greek-words.json" \
    "$GNOSIS_GREEK"
  "$PY" "$ROOT/scripts/import_strongs_gnosis.py"
else
  log "Strong's SQLite 已就绪"
fi

# ── 和合本 CUVS（data/bible/cuvs/verses.json → build/bible_cuvs.sqlite）──
CUVS_JSON="$ROOT/data/bible/cuvs/verses.json"
CUVS_SQL="$ROOT/build/bible_cuvs.sqlite"
if [[ -f "$CUVS_JSON" ]] && need_run "$CUVS_SQL" "$CUVS_JSON" "$ROOT/scripts/import_cuv.py"; then
  "$PY" "$ROOT/scripts/import_cuv.py" --input "$CUVS_JSON"
else
  if [[ -f "$CUVS_SQL" ]]; then
    log "和合本 SQLite 已就绪"
  else
    log "跳过 CUVS（无 $CUVS_JSON）"
  fi
fi

# ── CNV / KJV 主经库（verses.json → build/bible_*.sqlite，与 entrypoint 一致）──
for pair in "cnv:data/bible/cnv/verses.json:build/bible_cnv.sqlite" \
            "kjv:data/bible/kjv/verses.json:build/bible_kjv.sqlite"; do
  IFS=: read -r _ rel_in rel_out <<< "$pair"
  in="$ROOT/$rel_in"
  out="$ROOT/$rel_out"
  if [[ -f "$in" ]] && need_run "$out" "$in"; then
    log "生成 $(basename "$out") …"
    "$PY" "$ROOT/scripts/import_bible.py" --input "$in" --out "$out"
  fi
done

log "内容数据检查完成"
