#!/usr/bin/env bash
# E10：发版时 bump Service Worker CACHE 名（避免用户卡在旧壳）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SW="$ROOT/apps/web/public/sw.js"
cur=$(grep -oE "presto-bible-v[0-9]+" "$SW" | head -1)
num=${cur#presto-bible-v}
next="presto-bible-v$((num + 1))"
sed -i.bak "s/presto-bible-v${num}/presto-bible-v${next}/" "$SW"
rm -f "$SW.bak"
echo "SW cache: $cur -> $next"
