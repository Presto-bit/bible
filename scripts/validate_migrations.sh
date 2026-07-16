#!/usr/bin/env bash
# 校验 ensure_pg_schema.sh 与 infra/postgres/init 清单一致（E2）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENSURE="$ROOT/scripts/ensure_pg_schema.sh"
INIT_DIR="$ROOT/infra/postgres/init"

if [[ ! -f "$ENSURE" ]]; then
  echo "缺少 $ENSURE" >&2
  exit 1
fi

LISTED=()
while IFS= read -r line; do
  LISTED+=("$line")
done < <(grep -E '^\s+infra/postgres/init/[0-9]+_.*\.sql' "$ENSURE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

missing=0
for sql in "${LISTED[@]}"; do
  if [[ ! -f "$ROOT/$sql" ]]; then
    echo "❌ 清单引用但文件不存在: $sql" >&2
    missing=1
  fi
done

for f in "$INIT_DIR"/[0-9][0-9][0-9]_*.sql; do
  [[ -f "$f" ]] || continue
  rel="infra/postgres/init/$(basename "$f")"
  found=0
  for sql in "${LISTED[@]}"; do
    if [[ "$sql" == "$rel" ]]; then
      found=1
      break
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "❌ init 存在但未列入 ensure_pg_schema: $rel" >&2
    missing=1
  fi
done

if [[ $missing -ne 0 ]]; then
  exit 1
fi

echo "✓ 迁移清单与 init 目录一致（${#LISTED[@]} 个文件）"
