#!/usr/bin/env bash
# 服务器快速发版：git pull → docker compose build → up → 健康检查
#
# 用法（SSH 登录 ECS 后）：
#   cd /opt/bible
#   bash release.sh
#
# 环境变量：
#   APP_DIR=/opt/bible
#   REMOTE=origin
#   BRANCH=main
#   GIT_PULL=0          跳过 git pull（离线包发版）
#   COMPOSE_BUILD_PULL=0|1
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bible}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
GIT_PULL="${GIT_PULL:-1}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

log() { echo "[$(date +'%F %T')] $*"; }
die() { echo "❌ $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "未找到 docker"
docker compose version >/dev/null 2>&1 || die "未找到 docker compose v2"
command -v curl >/dev/null 2>&1 || die "未找到 curl"

[[ -d "$APP_DIR" ]] || die "项目目录不存在: $APP_DIR"
cd "$APP_DIR" || die "无法进入: $APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || die "缺少 $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "缺少 $ENV_FILE（从 .env.production.example 复制）"

WEB_HOST_PORT=3002
if grep -qE '^WEB_HOST_PORT=' "$ENV_FILE" 2>/dev/null; then
  WEB_HOST_PORT="$(grep -E '^WEB_HOST_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi
WEB_HOST_PORT="${WEB_HOST_PORT:-3002}"

log "发布目录: $APP_DIR"
log "Web 宿主机端口: $WEB_HOST_PORT"
log "远端/分支: $REMOTE/$BRANCH"

if [[ "$GIT_PULL" == "1" ]]; then
  log "拉取最新代码"
  git fetch "$REMOTE" "$BRANCH" || die "git fetch 失败"
  git pull --ff-only "$REMOTE" "$BRANCH" || die "git pull --ff-only 失败"
else
  log "GIT_PULL=0，跳过 git pull"
fi

export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
log "Web 构建版本: $NEXT_PUBLIC_APP_VERSION"

COMPOSE_BUILD_PULL="${COMPOSE_BUILD_PULL:-1}"
compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
build_flags=()
[[ "$COMPOSE_BUILD_PULL" == "1" ]] && build_flags+=(--pull)

log "构建镜像 api + web"
"${compose[@]}" build "${build_flags[@]}" api web || die "docker compose build 失败"

log "启动容器"
"${compose[@]}" up -d || die "docker compose up 失败"

log "健康检查 API"
api_ok=0
for i in $(seq 1 18); do
  if curl -fsS --connect-timeout 3 --max-time 8 http://127.0.0.1:8011/health >/dev/null 2>&1; then
    api_ok=1
    break
  fi
  log "API /health 未就绪 (${i}/18)…"
  sleep 2
done
[[ "$api_ok" -eq 1 ]] || die "API 健康检查失败"

log "健康检查 Web /"
web_ok=0
for i in $(seq 1 30); do
  if curl -fsS --connect-timeout 3 --max-time 15 -o /dev/null "http://127.0.0.1:${WEB_HOST_PORT}/" 2>/dev/null; then
    web_ok=1
    break
  fi
  log "Web / 未就绪 (${i}/30)…"
  sleep 3
done
if [[ "$web_ok" -ne 1 ]]; then
  "${compose[@]}" logs --tail 80 web >&2 || true
  die "Web 健康检查失败"
fi

for svc in postgres api web; do
  if [[ -z "$("${compose[@]}" ps -q --status running "$svc" 2>/dev/null || true)" ]]; then
    "${compose[@]}" ps -a >&2 || true
    die "容器 $svc 未 running"
  fi
done

log "发布成功"
log "  API: http://127.0.0.1:8011/health"
log "  Web: http://127.0.0.1:${WEB_HOST_PORT}/  →  https://2sc.prestoai.cn/"
log "若前有 Nginx/CDN，请确认反代与缓存策略（见 DEPLOYMENT.md）"
