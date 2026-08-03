#!/usr/bin/env bash
# 本地开发手动 bump SW CACHE（可选）
# 生产发版：release.sh → Docker build 会把 CACHE 重写为 presto-bible-${NEXT_PUBLIC_APP_VERSION}
# 无需再依赖本脚本，见 apps/web/Dockerfile
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SW="$ROOT/apps/web/public/sw.js"
cur=$(grep -oE "presto-bible-[A-Za-z0-9._-]+" "$SW" | head -1 || true)
if [[ -z "$cur" ]]; then
  echo "未在 $SW 找到 CACHE 名" >&2
  exit 1
fi
if [[ "$cur" =~ ^presto-bible-v([0-9]+)$ ]]; then
  next="presto-bible-v$((BASH_REMATCH[1] + 1))"
else
  next="presto-bible-v$(date +%s)"
fi
# macOS / GNU sed 兼容
if sed --version >/dev/null 2>&1; then
  sed -i "s|const CACHE = '${cur}'|const CACHE = '${next}'|" "$SW"
else
  sed -i.bak "s|const CACHE = '${cur}'|const CACHE = '${next}'|" "$SW"
  rm -f "$SW.bak"
fi
echo "SW cache: $cur -> $next（生产请走 Docker 烙印，无需提交此 bump）"
