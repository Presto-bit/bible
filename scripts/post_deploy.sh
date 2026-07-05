#!/usr/bin/env bash
# Docker Compose 启动后的公共步骤：PG 迁移、内容 SQLite、RAG 拉取与索引。
# release.sh / deploy/one_click_deploy.sh 共用。
#
# 用法（仓库根目录）：
#   bash scripts/post_deploy.sh
#   SKIP_RAG=1 bash scripts/post_deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
SKIP_RAG="${SKIP_RAG:-0}"

log() { echo "[post-deploy] $*"; }

cd "$APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || { log "❌ 缺少 $COMPOSE_FILE"; exit 1; }
[[ -f "$ENV_FILE" ]] || { log "❌ 缺少 $ENV_FILE"; exit 1; }

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

log "等待 API /health"
api_ok=0
for i in $(seq 1 30); do
  if curl -fsS --connect-timeout 3 --max-time 8 http://127.0.0.1:8011/health >/dev/null 2>&1; then
    api_ok=1
    break
  fi
  log "API 未就绪 (${i}/30)…"
  sleep 2
done
if [[ "$api_ok" -ne 1 ]]; then
  log "❌ API 健康检查失败"
  "${compose[@]}" logs --tail 80 api >&2 || true
  exit 1
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

if [[ "$SKIP_RAG" == "1" ]]; then
  log "SKIP_RAG=1，跳过 RAG"
  exit 0
fi

if ! "${compose[@]}" exec -T api test -f /app/scripts/ensure_rag.sh 2>/dev/null; then
  log "⚠️  容器内缺少 /app/scripts/ensure_rag.sh，请 rebuild api 镜像"
  exit 0
fi

log "RAG：拉取注释 + 索引（ensure_rag.sh，首次约数分钟～十余分钟）"
if "${compose[@]}" exec -T api bash /app/scripts/ensure_rag.sh 2>&1; then
  rag_chunks="$(curl -fsS http://127.0.0.1:8011/ai/rag/status 2>/dev/null | grep -oE '"chunks":[0-9]+' | cut -d: -f2 || echo 0)"
  rag_docs="$(curl -fsS http://127.0.0.1:8011/ai/rag/status 2>/dev/null | grep -oE '"documents":[0-9]+' | cut -d: -f2 || echo 0)"
  log "RAG 就绪：${rag_docs:-?} 篇 · ${rag_chunks:-?} 块"
else
  log "⚠️  RAG 步骤失败（无 Key / 网络不可达时不影响发版，可稍后重试 ensure_rag.sh）"
fi
