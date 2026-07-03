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
#   - JSON/CSV、strongs.sqlite 随 git pull 进入镜像，无需手工上传
#   - crossrefs.sqlite / bible_cuvs.sqlite 体积大，不入 git，在此脚本生成
#   - Strong's 缺失时会先尝试 STEPBible（分片较小），再尝试 Gnosis 镜像
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
  local tmp="${dest}.partial"
  rm -f "$tmp"
  curl -fsSL --connect-timeout 30 --max-time 900 --retry 3 --retry-delay 2 \
    -C - -o "$tmp" "$url"
  mv "$tmp" "$dest"
}

validate_bible_sqlite() {
  local f="$1"
  [[ -f "$f" && -s "$f" ]] || return 1
  local sz count
  sz="$(wc -c < "$f" | tr -d ' ')"
  [[ "$sz" -ge 1000000 ]] || return 1
  count="$("$PY" -c "
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
try:
    n = c.execute('SELECT COUNT(*) FROM verses').fetchone()[0]
except sqlite3.OperationalError:
    n = 0
c.close()
print(n)
" "$f")"
  [[ "$count" -ge 10000 ]]
}

validate_strongs_sqlite() {
  local f="$1"
  [[ -f "$f" && -s "$f" ]] || return 1
  local sz count
  sz="$(wc -c < "$f" | tr -d ' ')"
  [[ "$sz" -ge 1000000 ]] || return 1
  count="$("$PY" -c "
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
try:
    n = c.execute('SELECT COUNT(*) FROM verse_words').fetchone()[0]
except sqlite3.OperationalError:
    n = 0
c.close()
print(n)
" "$f")"
  [[ "$count" -ge 50000 ]]
}

# Gnosis greek-words.json 体积约 24MB，不完整 JSON 会导致 import 失败
validate_gnosis_greek() {
  local f="$1"
  [[ -f "$f" ]] || return 1
  local sz
  sz="$(wc -c < "$f" | tr -d ' ')"
  [[ "$sz" -ge 20000000 ]] || return 1
  "$PY" -c "
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
d = json.loads(p.read_text(encoding='utf-8'))
if not isinstance(d, dict) or len(d) < 5000:
    raise SystemExit(1)
" "$f"
}

fetch_gnosis_greek() {
  local dest="$CACHE/gnosis-greek-words.json"
  local tmp="${dest}.partial"
  local urls=(
    "https://ghproxy.net/https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/greek-words.json"
    "https://github.com/spearssoftware/gnosis/releases/download/v0.9.3/greek-words.json"
  )
  local labels=("ghproxy 镜像" "GitHub 直连")
  local url attempt idx=0
  for url in "${urls[@]}"; do
    for attempt in 1 2 3; do
      log "下载 gnosis-greek-words.json（${labels[$idx]} 尝试 ${attempt}/3）…"
      if curl -fsSL --connect-timeout 30 --max-time 1800 --retry 2 --retry-delay 3 \
        -C - -o "$tmp" "$url" && validate_gnosis_greek "$tmp"; then
        mv "$tmp" "$dest"
        log "gnosis-greek-words.json 校验通过 ($(wc -c < "$dest" | tr -d ' ') bytes)"
        return 0
      fi
      log "⚠ gnosis 下载不完整或 JSON 损坏，重试…"
      rm -f "$tmp"
      sleep 3
    done
    idx=$((idx + 1))
  done
  rm -f "$tmp" "$dest"
  return 1
}

build_strongs_sqlite() {
  local STRONGS_SQL="$ROOT/data/strongs/strongs.sqlite"
  local GNOSIS_GREEK="$CACHE/gnosis-greek-words.json"

  log "生成 Strong's SQLite（STEPBible）…"
  if "$PY" "$ROOT/scripts/import_strongs.py"; then
    validate_strongs_sqlite "$STRONGS_SQL" && return 0
    log "⚠ STEPBible 导入结果无效"
    rm -f "$STRONGS_SQL"
  else
    log "⚠ STEPBible 导入失败"
  fi

  if [[ ! -f "$GNOSIS_GREEK" ]] || ! validate_gnosis_greek "$GNOSIS_GREEK"; then
    rm -f "$GNOSIS_GREEK"
    fetch_gnosis_greek || {
      log "⚠ Strong's 源文件下载失败，跳过原文逐词"
      return 1
    }
  fi
  if "$PY" "$ROOT/scripts/import_strongs_gnosis.py"; then
    validate_strongs_sqlite "$STRONGS_SQL" && return 0
  fi
  log "⚠ Strong's 导入失败，跳过原文逐词"
  return 1
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

# ── Strong's 逐词（仓库自带 strongs.sqlite；缺失时 STEPBible → Gnosis）──
STRONGS_SQL="$ROOT/data/strongs/strongs.sqlite"
if validate_strongs_sqlite "$STRONGS_SQL"; then
  log "Strong's SQLite 已就绪"
elif need_run "$STRONGS_SQL" "$ROOT/scripts/import_strongs.py" "$ROOT/scripts/import_strongs_gnosis.py"; then
  build_strongs_sqlite || true
else
  log "Strong's SQLite 已就绪"
fi

# ── 和合本 CUVS（data/bible/cuvs/verses.json → build/bible_cuvs.sqlite）──
CUVS_JSON="$ROOT/data/bible/cuvs/verses.json"
CUVS_SQL="$ROOT/build/bible_cuvs.sqlite"
if [[ -f "$CUVS_JSON" ]]; then
  if validate_bible_sqlite "$CUVS_SQL"; then
    log "和合本 SQLite 已就绪"
  else
    log "生成 bible_cuvs.sqlite …"
    "$PY" "$ROOT/scripts/import_bible.py" --input "$CUVS_JSON" --out "$CUVS_SQL"
  fi
else
  if validate_bible_sqlite "$CUVS_SQL"; then
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
