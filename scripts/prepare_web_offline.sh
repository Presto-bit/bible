#!/usr/bin/env bash
# 将离线经包复制到 Web public 目录（发版前执行）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK_DIR="$ROOT/build/offline_pack"
OUT="$ROOT/apps/web/public/offline"
mkdir -p "$OUT" "$ROOT/apps/web/public/sql-wasm"

if [[ ! -f "$ROOT/build/bible_cnv.sqlite" ]]; then
  echo "→ 生成 CNV SQLite…"
  python3 "$ROOT/scripts/import_bible.py" \
    --input "$ROOT/data/bible/cnv/verses.json" \
    --out "$ROOT/build/bible_cnv.sqlite"
fi

if [[ ! -f "$ROOT/build/bible_kjv.sqlite" ]]; then
  echo "→ 拉取 scrollmapper KJV…"
  python3 "$ROOT/scripts/import_kjv_scrollmapper.py" --sqlite "$ROOT/build/bible_kjv.sqlite"
elif [[ ! -f "$ROOT/data/bible/kjv/verses.json" ]]; then
  echo "→ 生成 KJV SQLite…"
  python3 "$ROOT/scripts/import_kjv_scrollmapper.py" --sqlite "$ROOT/build/bible_kjv.sqlite"
elif [[ "$ROOT/data/bible/kjv/verses.json" -nt "$ROOT/build/bible_kjv.sqlite" ]]; then
  echo "→ 更新 KJV SQLite…"
  python3 "$ROOT/scripts/import_bible.py" \
    --input "$ROOT/data/bible/kjv/verses.json" \
    --out "$ROOT/build/bible_kjv.sqlite"
fi

if [[ ! -f "$ROOT/build/bible_contemporary.sqlite" ]]; then
  if [[ -f "$ROOT/data/bible/contemporary/verses.json" ]]; then
    echo "→ 生成当代译本 SQLite…"
    python3 "$ROOT/scripts/import_bible.py" \
      --input "$ROOT/data/bible/contemporary/verses.json" \
      --out "$ROOT/build/bible_contemporary.sqlite"
  else
    echo "⚠ 缺少当代译本 verses.json，跳过"
  fi
fi

echo "→ 打离线 zip…"
python3 "$ROOT/scripts/build_offline_pack.py" --translation cuvs

LATEST_ZIP="$(ls -t "$PACK_DIR"/bible_offline_*.zip | head -1)"
LATEST_MAN="$(ls -t "$PACK_DIR"/manifest_*.json | head -1)"
cp "$LATEST_ZIP" "$OUT/bible_offline.zip"

# 和合本单独直链：自动下载只拉 ~11MB，避免整包 ~26MB 全家桶
CUVS_SRC="$ROOT/build/bible_cuvs.sqlite"
if [[ -f "$CUVS_SRC" ]]; then
  cp "$CUVS_SRC" "$OUT/bible_cuvs.sqlite"
  echo "✓ bible_cuvs.sqlite ($(du -h "$OUT/bible_cuvs.sqlite" | awk '{print $1}'))"
else
  echo "⚠ 缺少 $CUVS_SRC，跳过和合本直链"
fi

python3 - <<PY
import hashlib
import json
from pathlib import Path
manifest = json.loads(Path("$LATEST_MAN").read_text(encoding="utf-8"))
manifest.setdefault("schema", "offline_pack@1")
manifest.setdefault("translation", "cnv")
cuvs = Path("$OUT/bible_cuvs.sqlite")
if cuvs.is_file():
    raw = cuvs.read_bytes()
    manifest["cuvs_sqlite"] = "bible_cuvs.sqlite"
    manifest["cuvs_sqlite_bytes"] = len(raw)
    manifest["cuvs_sqlite_sha256"] = hashlib.sha256(raw).hexdigest()
Path("$OUT/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
PY

python3 - <<PY
import json
from pathlib import Path
d = json.loads(Path("$ROOT/data/bible/cnv/verses.json").read_text(encoding="utf-8"))
books = [{"id": b["id"], "name": b["name"], "testament": b["testament"], "chapter_count": b["chapter_count"]} for b in d["books"]]
Path("$OUT/books.json").write_text(json.dumps({"books": books}, ensure_ascii=False), encoding="utf-8")
print(f"✓ books.json ({len(books)} 卷)")
PY

if [[ -d "$ROOT/apps/web/node_modules/sql.js/dist" ]]; then
  cp "$ROOT/apps/web/node_modules/sql.js/dist/sql-wasm.wasm" \
     "$ROOT/apps/web/node_modules/sql.js/dist/sql-wasm.js" \
     "$ROOT/apps/web/public/sql-wasm/" 2>/dev/null || true
  cp "$ROOT/apps/web/node_modules/sql.js/dist/sql-wasm.wasm" \
     "$ROOT/apps/web/public/sql-wasm/sql-wasm-browser.wasm" 2>/dev/null || true
  cp "$ROOT/apps/web/node_modules/sql.js/dist/sql-wasm.js" \
     "$ROOT/apps/web/public/sql-wasm/sql-wasm-browser.js" 2>/dev/null || true
fi

echo "✓ 离线资源已写入 $OUT"
