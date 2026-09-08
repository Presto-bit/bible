#!/usr/bin/env bash
# 清理指定 ref 前缀的小爱答案缓存（服务端 L1 内存）。
# 用法：
#   bash scripts/clear_xiaoai_cache.sh JHN.13
#   ADMIN_TOKEN=... API_BASE=https://api.example.com bash scripts/clear_xiaoai_cache.sh JHN.13
# 生产（/opt/bible，docker 内 API 进程）：
#   REF_PREFIX=JHN.13 APP_DIR=/opt/bible bash scripts/clear_xiaoai_cache.sh
set -euo pipefail

REF_PREFIX="${1:-${REF_PREFIX:?请提供 ref 前缀，如 JHN.13}}"
API_BASE="${API_BASE:-http://127.0.0.1:8000}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
APP_DIR="${APP_DIR:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

if [[ -n "$ADMIN_TOKEN" ]]; then
  resp="$(curl -fsS -X POST \
    "${API_BASE%/}/admin/ai/clear-answer-cache?ref_prefix=${REF_PREFIX}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")"
  echo "[clear-xiaoai] ${resp}"
  exit 0
fi

if [[ -n "$APP_DIR" && -d "$APP_DIR" ]]; then
  cd "$APP_DIR"
  compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
  echo "[clear-xiaoai] docker exec api ref=${REF_PREFIX}"
  "${compose[@]}" exec -T api python - <<PY
from app.rag.answer_cache import clear_answer_cache_for_ref_prefix
removed = clear_answer_cache_for_ref_prefix("${REF_PREFIX}")
print(f"removed={removed} scope=${REF_PREFIX}")
PY
  exit 0
fi

echo "[clear-xiaoai] 未设置 ADMIN_TOKEN / APP_DIR，跳过服务端清理。" >&2
echo "[clear-xiaoai] 客户端 localStorage 请在浏览器控制台执行：" >&2
cat <<'JS'
import { clearHalfSheetCacheForRefPrefix } from '@/lib/xiaoai_halfsheet_cache';
import { clearHalfSheetThreadsForRefPrefix } from '@/lib/xiaoai_halfsheet_thread';
clearHalfSheetCacheForRefPrefix('JHN.13');
clearHalfSheetThreadsForRefPrefix('JHN.13');
JS
