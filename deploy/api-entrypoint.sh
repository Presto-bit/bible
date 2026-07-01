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

exec "$@"
