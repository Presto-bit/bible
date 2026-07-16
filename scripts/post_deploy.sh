#!/usr/bin/env bash
# Docker Compose 启动后的公共步骤：PG 迁移、内容 SQLite。
# RAG 拉取/索引已移至管理后台手动执行，不再阻塞发版。
# release.sh / deploy/one_click_deploy.sh 共用。
#
# 用法（仓库根目录）：
#   bash scripts/post_deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

log() { echo "[post-deploy] $*"; }

cd "$APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || { log "❌ 缺少 $COMPOSE_FILE"; exit 1; }
[[ -f "$ENV_FILE" ]] || { log "❌ 缺少 $ENV_FILE"; exit 1; }

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

log "等待 API /health"
if [[ "${SKIP_API_WAIT:-0}" == "1" ]]; then
  if curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:8011/health >/dev/null 2>&1; then
    log "API 已就绪（跳过等待）"
  else
    log "⚠️  SKIP_API_WAIT=1 但 /health 未通，改为短轮询"
    SKIP_API_WAIT=0
  fi
fi
if [[ "${SKIP_API_WAIT:-0}" != "1" ]]; then
  api_ok=0
  for i in $(seq 1 45); do
    if curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:8011/health >/dev/null 2>&1; then
      api_ok=1
      break
    fi
    [[ $((i % 5)) -eq 0 ]] && log "API 未就绪 (${i}/45)…"
    sleep 1
  done
  if [[ "$api_ok" -ne 1 ]]; then
    log "❌ API 健康检查失败"
    "${compose[@]}" logs --tail 80 api >&2 || true
    exit 1
  fi
fi

if [[ -f "$APP_DIR/scripts/ensure_pg_schema.sh" ]]; then
  log "补跑 PG 迁移"
  bash "$APP_DIR/scripts/ensure_pg_schema.sh" || {
    log "❌ PG 迁移失败"
    exit 1
  }
fi

log "生成内容 SQLite（串珠 / Strong's / CUVS）"
if ! "${compose[@]}" exec -T api bash /app/scripts/ensure_content_data.sh 2>&1; then
  log "⚠️  内容 SQLite 生成失败（可能无出网）；串珠/原文/三译本对照或降级"
fi

log "RAG 不在发版环节执行；请登录管理后台 → RAG 资料 → 拉取注释 / 索引"
