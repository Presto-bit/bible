#!/usr/bin/env bash
# 将离线经包复制到 Web public 目录（发版前执行）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK_DIR="$ROOT/build/offline_pack"
OUT="$ROOT/apps/web/public/offline"
mkdir -p "$OUT" "$ROOT/apps/web/public/sql-wasm"

if [[ ! -f "$ROOT/build/bible_cnv.sqlite" ]]; then
  echo "→ 生成 SQLite…"
  python3 "$ROOT/scripts/import_bible.py" \
    --input "$ROOT/data/bible/cnv/verses.json" \
    --out "$ROOT/build/bible_cnv.sqlite"
fi

echo "→ 打离线 zip…"
python3 "$ROOT/scripts/build_offline_pack.py"

LATEST_ZIP="$(ls -t "$PACK_DIR"/bible_offline_*.zip | head -1)"
LATEST_MAN="$(ls -t "$PACK_DIR"/manifest_*.json | head -1)"
cp "$LATEST_ZIP" "$OUT/bible_offline.zip"
python3 - <<PY
import json
from pathlib import Path
manifest = json.loads(Path("$LATEST_MAN").read_text(encoding="utf-8"))
manifest.setdefault("schema", "offline_pack@1")
manifest.setdefault("translation", "cnv")
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
fi

echo "✓ 离线资源已写入 $OUT"
