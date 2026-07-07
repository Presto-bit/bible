#!/usr/bin/env bash
set -euo pipefail

CNV="/app/build/bible_cnv.sqlite"
KJV="/app/build/bible_kjv.sqlite"
CUVS="/app/build/bible_cuvs.sqlite"

if [[ ! -f "$CNV" && -f /app/data/bible/cnv/verses.json ]]; then
  echo "[entrypoint] 生成 bible_cnv.sqlite …"
  python /app/scripts/import_bible.py \
    --input /app/data/bible/cnv/verses.json \
    --out "$CNV"
fi

if [[ ! -f "$KJV" ]]; then
  if [[ -f /app/data/bible/kjv/verses.json ]]; then
    echo "[entrypoint] 生成 bible_kjv.sqlite …"
    python /app/scripts/import_bible.py \
      --input /app/data/bible/kjv/verses.json \
      --out "$KJV"
  elif [[ -x /app/scripts/import_kjv_scrollmapper.py ]]; then
    echo "[entrypoint] 拉取 scrollmapper KJV …"
    python /app/scripts/import_kjv_scrollmapper.py --sqlite "$KJV"
  fi
fi

if [[ ! -f "$CUVS" && -f /app/data/bible/cuvs/verses.json ]]; then
  echo "[entrypoint] 生成 bible_cuvs.sqlite …"
  python /app/scripts/import_bible.py \
    --input /app/data/bible/cuvs/verses.json \
    --out "$CUVS"
fi

# 修复历史错误导入产生的空库（import_cuv.py 误读 verses.json 格式）
if [[ -f "$CUVS" && -f /app/data/bible/cuvs/verses.json ]]; then
  cuvs_n="$(python -c "import sqlite3; c=sqlite3.connect('$CUVS'); print(c.execute('SELECT COUNT(*) FROM verses').fetchone()[0]); c.close()" 2>/dev/null || echo 0)"
  if [[ "${cuvs_n:-0}" -lt 10000 ]]; then
    echo "[entrypoint] 重建 bible_cuvs.sqlite（当前仅 ${cuvs_n} 节）…"
    python /app/scripts/import_bible.py \
      --input /app/data/bible/cuvs/verses.json \
      --out "$CUVS"
  fi
fi

# 大数据集（串珠/Strong's/CUVS）在后台生成，不阻塞 uvicorn 启动与健康检查。
# 发版时 post_deploy.sh / release.sh 会同步再跑 ensure_content_data.sh。
if [[ "${ENSURE_CONTENT_DATA_BG:-1}" == "1" && -x /app/scripts/ensure_content_data.sh ]]; then
  echo "[entrypoint] 后台生成内容 SQLite（不阻塞 API 启动）…"
  ( bash /app/scripts/ensure_content_data.sh >>/tmp/ensure_content_data.log 2>&1 || true ) &
fi

# RAG 资料目录（持久化卷挂载点；首次启动确保子目录存在）
mkdir -p \
  /app/content/commentary/public-domain \
  /app/content/commentary/public-domain-ocd \
  /app/content/commentary/reference-en \
  /app/content/commentary/study-bible-zh \
  /app/content/commentary/study-bible \
  /app/data/rag/uploads

exec "$@"
