#!/usr/bin/env bash
set -euo pipefail

CNV="/app/build/bible_cnv.sqlite"
KJV="/app/build/bible_kjv.sqlite"

if [[ ! -f "$CNV" && -f /app/data/bible/cnv/verses.json ]]; then
  echo "[entrypoint] 生成 bible_cnv.sqlite …"
  python /app/scripts/import_bible.py \
    --input /app/data/bible/cnv/verses.json \
    --out "$CNV"
fi

if [[ ! -f "$KJV" && -f /app/data/bible/kjv/verses.json ]]; then
  echo "[entrypoint] 生成 bible_kjv.sqlite …"
  python /app/scripts/import_bible.py \
    --input /app/data/bible/kjv/verses.json \
    --out "$KJV"
fi

# 交叉引用 / Strong's / CUVS（缺失时生成；需网络，失败不阻断 API 启动）
if [[ -x /app/scripts/ensure_content_data.sh ]]; then
  bash /app/scripts/ensure_content_data.sh || echo "[entrypoint] ⚠ ensure_content_data 跳过（无网络或缓存失败）"
fi

exec "$@"
