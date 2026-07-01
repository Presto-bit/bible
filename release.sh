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

# root 操作 presto 属主的仓库会触发 git「dubious ownership」；自动切到目录属主
if [[ "${EUID:-0}" -eq 0 && "${RELEASE_AS_ROOT:-0}" != "1" ]]; then
  repo_owner="$(stat -c '%U' "$APP_DIR" 2>/dev/null || true)"
  if [[ -n "$repo_owner" && "$repo_owner" != "root" ]] && id -u "$repo_owner" &>/dev/null; then
    release_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
    log "检测到 root 运行但 $APP_DIR 属主为 $repo_owner，切换用户后继续（请改用 presto 登录发版）"
    exec sudo -u "$repo_owner" -H \
      APP_DIR="$APP_DIR" REMOTE="$REMOTE" BRANCH="$BRANCH" \
      GIT_PULL="$GIT_PULL" COMPOSE_BUILD_PULL="${COMPOSE_BUILD_PULL:-1}" \
      NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-}" \
      bash "$release_script"
  fi
fi

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

log "健康检查 Web 静态资源（CSS）"
css_path="$(curl -fsS --connect-timeout 3 --max-time 15 "http://127.0.0.1:${WEB_HOST_PORT}/" \
  | grep -oE '/_next/static/css/[^" ]+\.css' | head -1 || true)"
if [[ -z "$css_path" ]] || ! curl -fsS --connect-timeout 3 --max-time 15 -o /dev/null \
  "http://127.0.0.1:${WEB_HOST_PORT}${css_path}" 2>/dev/null; then
  die "Web 静态资源不可访问（CSS 404）。请执行: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE build --no-cache web && ... up -d web"
fi

pub_url=""
if grep -qE '^PUBLIC_WEB_URL=' "$ENV_FILE" 2>/dev/null; then
  pub_url="$(grep -E '^PUBLIC_WEB_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi
if [[ -n "$pub_url" && -n "$css_path" ]]; then
  pub_code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 20 \
    "${pub_url%/}${css_path}" 2>/dev/null || echo "000")"
  if [[ "$pub_code" != "200" ]]; then
    log "⚠️  本机 ${WEB_HOST_PORT} CSS 正常，但公网 ${pub_url}${css_path} 返回 HTTP ${pub_code}"
    log "   宝塔/Nginx 反代很可能仍指向 3000 或其它端口，请改为 127.0.0.1:${WEB_HOST_PORT}（见 DEPLOYMENT.md §宝塔）"
  fi
fi

for svc in postgres api web; do
  if [[ -z "$("${compose[@]}" ps -q --status running "$svc" 2>/dev/null || true)" ]]; then
    "${compose[@]}" ps -a >&2 || true
    die "容器 $svc 未 running"
  fi
done

# 首页 HTML 须为新版本（旧版含假数据「3,842 人点赞」）
home_html="$(curl -fsS "http://127.0.0.1:${WEB_HOST_PORT}/" 2>/dev/null || true)"
if [[ -z "$home_html" ]]; then
  die "无法拉取首页 HTML"
fi
if echo "$home_html" | grep -q '3,842'; then
  die "首页仍是旧版（含 3,842 假点赞），请 docker compose build --no-cache web 后重试"
fi
if ! echo "$home_html" | grep -q '每日问答'; then
  die "首页未含「每日问答」，可能构建未更新，请检查 git pull 与 web 镜像"
fi
if ! echo "$home_html" | grep -q "$NEXT_PUBLIC_APP_VERSION"; then
  log "⚠️  本机首页 meta app-version 与构建 $NEXT_PUBLIC_APP_VERSION 不一致"
fi

if [[ -n "$pub_url" ]]; then
  pub_home="$(curl -fsS --connect-timeout 5 --max-time 20 "${pub_url%/}/" 2>/dev/null || true)"
  pub_home_bust="$(curl -fsS --connect-timeout 5 --max-time 20 "${pub_url%/}/?_nc=$(date +%s)" 2>/dev/null || true)"
  if [[ -n "$pub_home" ]]; then
    if echo "$pub_home" | grep -q '3,842'; then
      log "⚠️  公网 / 仍是旧版（含 3,842）"
      if [[ -n "$pub_home_bust" ]] && ! echo "$pub_home_bust" | grep -q '3,842'; then
        log "   但 /?_nc=… 已是新版 → 宝塔/Nginx 仅缓存了精确路径 /"
        log "   处理：① 宝塔关闭全站缓存 ② 加入 location = /（见 deploy/nginx-baota-2sc.full-server.conf）③ nginx -s reload"
      fi
    elif ! echo "$pub_home" | grep -q '每日问答'; then
      log "⚠️  公网首页未含「每日问答」，请检查宝塔反代是否指向 ${WEB_HOST_PORT}"
    else
      log "公网首页版本校验通过"
    fi
  fi
fi

log "发布成功"
log "  API: http://127.0.0.1:8011/health"
log "  Web: http://127.0.0.1:${WEB_HOST_PORT}/  →  https://2sc.prestoai.cn/"
log "若前有 Nginx/CDN，请确认反代与缓存策略（见 DEPLOYMENT.md）"
