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

# 大数据集（串珠/Strong's/CUVS）在后台生成，不阻塞 uvicorn 启动与健康检查。
# 发版时 release.sh 会在 API 就绪后同步再跑一遍 ensure_content_data.sh。
if [[ "${ENSURE_CONTENT_DATA_BG:-1}" == "1" && -x /app/scripts/ensure_content_data.sh ]]; then
  echo "[entrypoint] 后台生成内容 SQLite（不阻塞 API 启动）…"
  ( bash /app/scripts/ensure_content_data.sh >>/tmp/ensure_content_data.log 2>&1 || true ) &
fi

exec "$@"
