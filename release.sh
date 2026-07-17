#!/usr/bin/env bash
# 服务器快速发版：git pull →（按变更）compose build → up → 健康检查 / 劫持检查
#
# 用法（SSH 登录 ECS 后，root 或 presto 均可）：
#   cd /opt/bible && bash release.sh
#   # 或任意目录：bash /opt/bible/release.sh
#
# 环境变量：
#   APP_DIR=/opt/bible
#   DEPLOY_USER=presto   发版系统用户（非该用户时自动 sudo 切换）
#   REMOTE=origin
#   BRANCH=main
#   GIT_PULL=0           跳过 git pull（离线包发版）
#   COMPOSE_BUILD_PULL=0|1  默认 0：不每次拉基础镜像（省数分钟）；需要时再开
#   ALLOW_DIRTY=1          允许脏工作区发版（默认 0：拒绝）
#   WEB_BUILD_NO_CACHE=0|1 默认 0：沿用 Docker 缓存；怀疑污染时再设 1
#   FORCE_FULL=1           强制重建 api+web（忽略变更检测）；可与 WEB_BUILD_NO_CACHE=1 联用
#   BUILD_API=0|1          强制跳过/强制构建 api（默认按变更自动）
#   BUILD_WEB=0|1          强制跳过/强制构建 web（默认按变更自动）
#   INSTALL_HIJACK_CRON=1  安装每分钟劫持探测+自愈 cron（默认 0）
#
# 适合放进本脚本：干净 git、按变更增量构建、启动命令/容器内扫描、外域跳转拦截、可选 cron。
# 不适合：改宝塔/SSH 密码、安全组、同机其它项目排查——仍需人工。
# 说明：rebirthstress 跳转是生产机污染 web 容器，不是登录业务逻辑；怀疑污染时用
#   WEB_BUILD_NO_CACHE=1 FORCE_FULL=1 bash release.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bible}"
DEPLOY_USER="${DEPLOY_USER:-presto}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
GIT_PULL="${GIT_PULL:-1}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
WEB_BUILD_NO_CACHE="${WEB_BUILD_NO_CACHE:-0}"
FORCE_FULL="${FORCE_FULL:-0}"
INSTALL_HIJACK_CRON="${INSTALL_HIJACK_CRON:-0}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
RELEASE_SHA_FILE=".release-sha"

RELEASE_T0=$SECONDS
log() { echo "[$(date +'%F %T')] (+$((SECONDS - RELEASE_T0))s) $*"; }
die() { echo "❌ $*" >&2; exit 1; }

# 允许的跳转目标主机（与 PUBLIC_WEB_URL / 本机一致）；其它外域 Location 视为劫持
WEB_HIJACK_DENY_RE='rebirthstress|stresser|booter|register\?ref='

# 检查 URL 响应头：禁止外域劫持跳转；允许同域跳转或无 Location 的成功响应
assert_web_not_hijacked() {
  local url="$1"
  local label="${2:-$url}"
  local headers code loc host allow_host
  headers="$(curl -sSI --connect-timeout 5 --max-time 15 --max-redirs 0 "$url" 2>/dev/null || true)"
  if [[ -z "$headers" ]]; then
    die "劫持检查失败：无法访问 $label（连接失败，Web 可能未就绪）"
  fi
  code="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'toupper($1) ~ /^HTTP\//{print $2; exit}')"
  loc="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')"

  if printf '%s\n' "$headers"$'\n'"$loc" | grep -qiE "$WEB_HIJACK_DENY_RE"; then
    die "检测到 Web 劫持跳转：$label → ${loc:-?}（请重建 web 镜像并检查服务器是否被控）"
  fi

  if [[ -n "$loc" ]]; then
    # 相对路径跳转视为同站
    if [[ "$loc" == /* ]]; then
      :
    else
      host="$(printf '%s' "$loc" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^/]+).*#\1#' | tr '[:upper:]' '[:lower:]')"
      allow_host=""
      if [[ -n "${PUBLIC_WEB_URL_HOST:-}" ]]; then
        allow_host="$PUBLIC_WEB_URL_HOST"
      fi
      case "$host" in
        localhost|127.0.0.1|"$allow_host"|"www.$allow_host") ;;
        *)
          die "Web 跳转到未知外域：$label → $loc（禁止发布）"
          ;;
      esac
    fi
  fi

  # 不跟随跳转：本机页应直接 200/304；若仍是 3xx 且上面未放行则已 die
  if [[ "$code" == "301" || "$code" == "302" || "$code" == "303" || "$code" == "307" || "$code" == "308" ]]; then
    if [[ -z "$loc" ]]; then
      die "Web 返回 $code 但无 Location：$label"
    fi
    log "  ✓ $label HTTP $code → $loc（同域，已放行）"
  elif [[ "$code" != "200" && "$code" != "304" ]]; then
    die "Web 劫持检查异常：$label HTTP ${code:-?}（期望 200）"
  else
    log "  ✓ $label HTTP $code（无外域跳转）"
  fi
}

# 发版后：确认 web 容器仍是「干净 Next standalone」，未被改启动命令/植入跳转串
# 成功返回 0；失败打印原因并返回 1（不直接 exit，便于重试）
assert_web_container_clean() {
  local cid name cmd mounts hits
  cid="$("${compose[@]}" ps -q web 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    echo "找不到 web 容器" >&2
    return 1
  fi
  name="$(docker inspect -f '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')"
  cmd="$(docker inspect -f '{{json .Config.Cmd}} {{json .Args}}' "$cid" 2>/dev/null || true)"
  if ! printf '%s' "$cmd" | grep -q 'server.js'; then
    echo "web 容器启动命令异常（期望含 server.js）：$cmd" >&2
    return 1
  fi
  mounts="$(docker inspect -f '{{range .Mounts}}{{.Destination}}={{.Source}};{{end}}' "$cid" 2>/dev/null || true)"
  if printf '%s' "$mounts" | grep -qE '/app(=|/)' ; then
    echo "web 容器把宿主机目录挂到 /app，存在运行时被改风险：$mounts" >&2
    return 1
  fi
  if ! docker exec "$cid" true 2>/dev/null; then
    echo "web 容器尚未可 docker exec" >&2
    return 1
  fi
  hits="$(docker exec "$cid" sh -c \
    "set +e
     # 只扫入口与浅层产物，避免全量递归 /app（standalone 体积大，会拖慢发版）
     grep -niE '$WEB_HIJACK_DENY_RE' /app/server.js /app/package.json 2>/dev/null
     find /app -maxdepth 2 -type f \( -name '*.js' -o -name '*.json' -o -name '*.html' \) \
       ! -path '*/node_modules/*' 2>/dev/null | head -60 \
       | while read -r f; do grep -niE '$WEB_HIJACK_DENY_RE' \"\$f\" 2>/dev/null; done
     find /app/.next -maxdepth 3 -type f \( -name '*.html' -o -name 'routes-manifest.json' \) \
       2>/dev/null | head -40 \
       | while read -r f; do grep -niE '$WEB_HIJACK_DENY_RE' \"\$f\" 2>/dev/null; done
     true" \
    | head -20 || true)"
  if [[ -n "$hits" ]]; then
    printf '%s\n' "$hits" >&2
    echo "web 容器 /app 内检出劫持特征串（$name）" >&2
    return 1
  fi
  log "  ✓ web 容器完整性：$name 启动命令与入口扫描通过"
  return 0
}

# root / 其它用户：自动 sudo 到 presto，进入仓库并拉代码后发版（等价于原 one-liner）
if [[ "${RELEASE_BOOTSTRAPPED:-0}" != "1" && "$(id -un)" != "$DEPLOY_USER" ]]; then
  id -u "$DEPLOY_USER" &>/dev/null || die "发版用户不存在: $DEPLOY_USER"
  [[ -d "$APP_DIR" ]] || die "项目目录不存在: $APP_DIR"
  release_script="$APP_DIR/release.sh"
  [[ -f "$release_script" ]] || release_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  pull_part=""
  inner_git_pull="$GIT_PULL"
  if [[ "$GIT_PULL" == "1" ]]; then
    pull_part="git fetch '$REMOTE' '$BRANCH' && git pull --ff-only '$REMOTE' '$BRANCH' && "
    inner_git_pull=0
  fi
  log "当前用户 $(id -un)，切换为 $DEPLOY_USER 后发版"
  exec sudo -u "$DEPLOY_USER" -H bash -c \
    "cd '$APP_DIR' && ${pull_part}APP_DIR='$APP_DIR' DEPLOY_USER='$DEPLOY_USER' REMOTE='$REMOTE' BRANCH='$BRANCH' \
     GIT_PULL='$inner_git_pull' COMPOSE_BUILD_PULL='${COMPOSE_BUILD_PULL:-0}' \
     ALLOW_DIRTY='$ALLOW_DIRTY' WEB_BUILD_NO_CACHE='$WEB_BUILD_NO_CACHE' \
     FORCE_FULL='$FORCE_FULL' BUILD_API='${BUILD_API:-}' BUILD_WEB='${BUILD_WEB:-}' \
     INSTALL_HIJACK_CRON='$INSTALL_HIJACK_CRON' \
     NEXT_PUBLIC_APP_VERSION='${NEXT_PUBLIC_APP_VERSION:-}' RELEASE_BOOTSTRAPPED=1 \
     bash '$release_script'"
fi

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

# 干净工作区：避免把服务器上被改过的脏文件打进镜像
if [[ "$ALLOW_DIRTY" != "1" ]]; then
  dirty="$(git status --porcelain 2>/dev/null || true)"
  if [[ -n "$dirty" ]]; then
    printf '%s\n' "$dirty" >&2
    die "工作区不干净（ALLOW_DIRTY=1 可强制）。请 git status 清理后再发版，勿在容器/宿主机热改代码"
  fi
  log "  ✓ git 工作区干净"
else
  log "⚠️  ALLOW_DIRTY=1，跳过工作区干净检查"
fi

# 与远端分支一致（防本地偷偷超前/落后误发）
if git rev-parse "$REMOTE/$BRANCH" >/dev/null 2>&1; then
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "$REMOTE/$BRANCH")"
  if [[ "$local_sha" != "$remote_sha" ]]; then
    die "本地 HEAD ($local_sha) ≠ $REMOTE/$BRANCH ($remote_sha)；请先 pull/对齐再发版"
  fi
  log "  ✓ HEAD 对齐 $REMOTE/$BRANCH ($local_sha)"
fi

export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
log "Web 构建版本: $NEXT_PUBLIC_APP_VERSION"

COMPOSE_BUILD_PULL="${COMPOSE_BUILD_PULL:-0}"
compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
build_flags=()
[[ "$COMPOSE_BUILD_PULL" == "1" ]] && build_flags+=(--pull)

# ── 按上次成功发版的 SHA 决定重建哪些服务（大幅缩短常规发版）──
need_api=1
need_web=1
prev_sha=""
if [[ "$FORCE_FULL" == "1" ]]; then
  log "FORCE_FULL=1：强制重建 api + web"
elif [[ -n "${BUILD_API:-}" || -n "${BUILD_WEB:-}" ]]; then
  need_api="${BUILD_API:-0}"
  need_web="${BUILD_WEB:-0}"
  log "手动指定 BUILD_API=$need_api BUILD_WEB=$need_web"
elif [[ -f "$RELEASE_SHA_FILE" ]]; then
  prev_sha="$(tr -d '[:space:]' < "$RELEASE_SHA_FILE" || true)"
  if [[ -n "$prev_sha" ]] && git rev-parse --verify "${prev_sha}^{commit}" >/dev/null 2>&1; then
    if [[ "$prev_sha" == "$(git rev-parse HEAD)" ]]; then
      need_api=0
      need_web=0
      log "HEAD 与上次发版相同（$prev_sha），跳过镜像构建（仍会 up -d + 检查）"
    else
      changed="$(git diff --name-only "$prev_sha" HEAD 2>/dev/null || true)"
      need_api=0
      need_web=0
      if [[ -z "$changed" ]]; then
        log "相对 $prev_sha 无文件变更，跳过构建"
      else
        if echo "$changed" | grep -qE \
          '^(services/api/|infra/postgres/|scripts/(ensure_|post_deploy)|docker-compose\.prod\.yml|services/api/Dockerfile)'; then
          need_api=1
        fi
        if echo "$changed" | grep -qE \
          '^(apps/web/|apps/web/Dockerfile|package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|docker-compose\.prod\.yml)'; then
          need_web=1
        fi
        # 根级脚本/配置变更：保守重建两侧
        if echo "$changed" | grep -qE '^(release\.sh|deploy/|Dockerfile$)'; then
          need_api=1
          need_web=1
        fi
        log "相对上次发版 $prev_sha："
        log "  变更文件数: $(printf '%s\n' "$changed" | grep -c . || echo 0)"
        log "  重建 api=$need_api  web=$need_web"
      fi
    fi
  else
    log "上次发版标记无效，全量构建 api+web"
  fi
else
  log "无 $RELEASE_SHA_FILE，首次/全量构建 api+web"
fi

build_targets=()
[[ "$need_api" == "1" ]] && build_targets+=(api)
[[ "$need_web" == "1" ]] && build_targets+=(web)

if [[ ${#build_targets[@]} -eq 0 ]]; then
  log "无需构建镜像"
else
  if [[ "$need_web" == "1" && "$WEB_BUILD_NO_CACHE" == "1" ]]; then
    log "构建镜像：${build_targets[*]}（web --no-cache）"
    # api 可走缓存；web 单独无缓存，避免整次 --no-cache 拖垮 api
    if [[ "$need_api" == "1" ]]; then
      "${compose[@]}" build "${build_flags[@]}" api || die "docker compose build api 失败"
    fi
    "${compose[@]}" build "${build_flags[@]}" --no-cache web || die "docker compose build web 失败"
  else
    log "构建镜像：${build_targets[*]}（缓存开启${COMPOSE_BUILD_PULL:+，pull=$COMPOSE_BUILD_PULL}）"
    "${compose[@]}" build "${build_flags[@]}" "${build_targets[@]}" || die "docker compose build 失败"
  fi
fi

log "启动容器"
"${compose[@]}" up -d || die "docker compose up 失败"

log "容器完整性：web 启动命令与入口扫描"
web_clean_ok=0
for i in $(seq 1 20); do
  if assert_web_container_clean 2>/tmp/bible-web-clean.err; then
    web_clean_ok=1
    break
  fi
  log "web 容器完整性未就绪 (${i}/20)…"
  sleep 1
done
if [[ "$web_clean_ok" -ne 1 ]]; then
  cat /tmp/bible-web-clean.err >&2 || true
  die "web 容器完整性检查失败（怀疑污染可：WEB_BUILD_NO_CACHE=1 FORCE_FULL=1 bash release.sh）"
fi

log "健康检查 API"
api_ok=0
for i in $(seq 1 45); do
  if curl -fsS --connect-timeout 2 --max-time 5 http://127.0.0.1:8011/health >/dev/null 2>&1; then
    api_ok=1
    break
  fi
  [[ $((i % 5)) -eq 0 ]] && log "API /health 未就绪 (${i}/45)…"
  sleep 1
done
if [[ "$api_ok" -ne 1 ]]; then
  log "API 日志（最近 80 行）："
  "${compose[@]}" logs --tail 80 api >&2 || true
  die "API 健康检查失败（若刚发版，查看 entrypoint 是否报错）"
fi

log "Post-deploy：PG 迁移 / 内容 SQLite"
if ! SKIP_API_WAIT=1 bash "$APP_DIR/scripts/post_deploy.sh"; then
  die "post_deploy 失败（PG 迁移或 API 不可用）"
fi

log "校验圣经译本"
if versions_json="$(curl -fsS "http://127.0.0.1:8011/bible/versions" 2>/dev/null)"; then
  for vid in cnv cuvs kjv; do
    if echo "$versions_json" | grep -q "\"id\":\"$vid\".*\"available\":true"; then
      log "  ✓ $vid 可用"
    else
      log "  ⚠ $vid 不可用（对照/和合本可能无数据）"
    fi
  done
else
  log "⚠️  无法读取 /bible/versions"
fi

# 鉴权冒烟：裸 User-Code 必须 401；持会话令牌必须 200
api_base_local="http://127.0.0.1:8011"
like_anon="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${api_base_local}/content/daily-verse/like" \
  -H "Content-Type: application/json" -H "X-User-Code: 12345678" 2>/dev/null || echo "000")"
social_anon="$(curl -s -o /dev/null -w '%{http_code}' "${api_base_local}/social/groups" \
  -H "X-User-Code: 12345678" 2>/dev/null || echo "000")"
if [[ "$like_anon" != "401" && "$like_anon" != "000" ]]; then
  die "未授权点赞返回 HTTP $like_anon（期望 401；若为 200 说明 AUTH_DEV_ALLOW_USER_HEADER 仍开启）"
fi
if [[ "$social_anon" != "401" && "$social_anon" != "000" ]]; then
  die "未授权社交返回 HTTP $social_anon（期望 401）"
fi

smoke_device="release-smoke-$(hostname 2>/dev/null || echo host)-$$"
smoke_code="$(printf '%08d' "$((RANDOM % 90000000 + 10000000))")"
reg_body="$(curl -sS -X POST "${api_base_local}/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: ${smoke_device}" \
  -d "{\"user_code\":\"${smoke_code}\"}" 2>/dev/null || true)"
smoke_token=""
if command -v python3 >/dev/null 2>&1; then
  smoke_token="$(printf '%s' "$reg_body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("session_token") or "")' 2>/dev/null || true)"
elif command -v jq >/dev/null 2>&1; then
  smoke_token="$(printf '%s' "$reg_body" | jq -r '.session_token // empty' 2>/dev/null || true)"
fi

if [[ -z "$smoke_token" ]]; then
  log "register 响应片段: $(printf '%s' "$reg_body" | head -c 300)"
  die "无法签发冒烟会话（register 未返回 session_token）。检查 SESSION_TOKEN_SECRET 与 AUTH_DEV_ALLOW_USER_HEADER=0"
fi

# 负向：对已存在账号、无设备绑定、无会话的静默 register 不得签发（防接管）
hijack_code="$(curl -s -o /tmp/bible-reg-hijack.body -w '%{http_code}' -X POST "${api_base_local}/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: hijack-${smoke_device}" \
  -d "{\"user_code\":\"${smoke_code}\"}" 2>/dev/null || echo "000")"
hijack_token=""
if command -v python3 >/dev/null 2>&1; then
  hijack_token="$(python3 -c 'import json; d=json.load(open("/tmp/bible-reg-hijack.body")); print(d.get("session_token") or "")' 2>/dev/null || true)"
elif command -v jq >/dev/null 2>&1; then
  hijack_token="$(jq -r '.session_token // empty' /tmp/bible-reg-hijack.body 2>/dev/null || true)"
fi
if [[ "$hijack_code" != "403" ]]; then
  die "静默 register 接管检查失败：期望 HTTP 403，实际 ${hijack_code}"
fi
if [[ -n "$hijack_token" ]]; then
  die "静默 register 仍对他人账号签发了 session_token（接管漏洞）"
fi
rm -f /tmp/bible-reg-hijack.body 2>/dev/null || true

like_code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${api_base_local}/content/daily-verse/like" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${smoke_token}" \
  -H "X-Device-Id: ${smoke_device}" 2>/dev/null || echo "000")"
social_code="$(curl -s -o /dev/null -w '%{http_code}' "${api_base_local}/social/groups" \
  -H "Authorization: Bearer ${smoke_token}" \
  -H "X-Device-Id: ${smoke_device}" 2>/dev/null || echo "000")"

if [[ "$like_code" == "503" ]]; then
  die "点赞 API 仍 503，请检查 PG 是否已应用 005_daily_verse_engagement.sql"
fi
if [[ "$like_code" != "200" ]]; then
  die "点赞 API（带会话）返回 HTTP $like_code（期望 200）"
fi
if [[ "$social_code" != "200" ]]; then
  die "社交 API（带会话）返回 HTTP $social_code（期望 200；401 请查 SESSION_TOKEN_SECRET）"
fi

pub_url=""
PUBLIC_WEB_URL_HOST=""
if grep -qE '^PUBLIC_WEB_URL=' "$ENV_FILE" 2>/dev/null; then
  pub_url="$(grep -E '^PUBLIC_WEB_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
  PUBLIC_WEB_URL_HOST="$(printf '%s' "${pub_url}" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^/]+).*#\1#' | tr '[:upper:]' '[:lower:]')"
fi
PUBLIC_WEB_URL_HOST="${PUBLIC_WEB_URL_HOST:-2sc.prestoai.cn}"
export PUBLIC_WEB_URL_HOST

log "健康检查 Web /（不跟随外域跳转）"
web_ok=0
for i in $(seq 1 60); do
  # --max-redirs 0：避免劫持 307 后目标站 200 被误判为健康
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 8 --max-redirs 0 \
    "http://127.0.0.1:${WEB_HOST_PORT}/" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" || "$code" == "304" ]]; then
    web_ok=1
    break
  fi
  [[ $((i % 5)) -eq 0 ]] && log "Web / 未就绪 code=${code} (${i}/60)…"
  sleep 1
done
if [[ "$web_ok" -ne 1 ]]; then
  "${compose[@]}" logs --tail 80 web >&2 || true
  die "Web 健康检查失败"
fi

log "劫持检查：本机 Web 禁止外域跳转"
assert_web_not_hijacked "http://127.0.0.1:${WEB_HOST_PORT}/" "本机 /"
assert_web_not_hijacked "http://127.0.0.1:${WEB_HOST_PORT}/login" "本机 /login"

log "健康检查 Web 静态资源（CSS）"
css_path="$(curl -fsS --connect-timeout 3 --max-time 15 --max-redirs 0 "http://127.0.0.1:${WEB_HOST_PORT}/" \
  | grep -oE '/_next/static/css/[^" ]+\.css' | head -1 || true)"
if [[ -z "$css_path" ]] || ! curl -fsS --connect-timeout 3 --max-time 15 --max-redirs 0 -o /dev/null \
  "http://127.0.0.1:${WEB_HOST_PORT}${css_path}" 2>/dev/null; then
  die "Web 静态资源不可访问（CSS 404）。请执行: docker compose -f $COMPOSE_FILE --env-file $ENV_FILE build --no-cache web && ... up -d web"
fi
assert_web_not_hijacked "http://127.0.0.1:${WEB_HOST_PORT}${css_path}" "本机 CSS"

if [[ -n "$pub_url" && -n "$css_path" ]]; then
  pub_code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 20 --max-redirs 0 \
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
home_html="$(curl -fsS --max-redirs 0 "http://127.0.0.1:${WEB_HOST_PORT}/" 2>/dev/null || true)"
if [[ -z "$home_html" ]]; then
  die "无法拉取首页 HTML"
fi
if echo "$home_html" | grep -qiE "$WEB_HIJACK_DENY_RE"; then
  die "首页 HTML 含劫持特征串，请勿上线"
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
  log "劫持检查：公网 Web"
  assert_web_not_hijacked "${pub_url%/}/" "公网 /"
  assert_web_not_hijacked "${pub_url%/}/login" "公网 /login"

  pub_home="$(curl -fsS --connect-timeout 5 --max-time 20 --max-redirs 0 "${pub_url%/}/" 2>/dev/null || true)"
  pub_home_bust="$(curl -fsS --connect-timeout 5 --max-time 20 --max-redirs 0 "${pub_url%/}/?_nc=$(date +%s)" 2>/dev/null || true)"
  if [[ -n "$pub_home" ]]; then
    if echo "$pub_home" | grep -qiE "$WEB_HIJACK_DENY_RE"; then
      die "公网首页 HTML 含劫持特征串"
    fi
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

log "发布成功（耗时 $((SECONDS - RELEASE_T0))s）"
log "  API: http://127.0.0.1:8011/health"
log "  Web: http://127.0.0.1:${WEB_HOST_PORT}/  →  https://2sc.prestoai.cn/"
log "若前有 Nginx/CDN，请确认反代与缓存策略（见 DEPLOYMENT.md）"
# 记录成功发版 SHA，供下次增量构建
git rev-parse HEAD > "$RELEASE_SHA_FILE" || true
log "  ✓ 已写入 $RELEASE_SHA_FILE=$(git rev-parse --short HEAD 2>/dev/null || echo '?')"

if [[ "$INSTALL_HIJACK_CRON" == "1" ]]; then
  cron_src="$APP_DIR/scripts/check_web_hijack.sh"
  [[ -f "$cron_src" ]] || die "缺少 $cron_src"
  chmod +x "$cron_src" || true
  cron_line="* * * * * root APP_DIR=$APP_DIR AUTO_HEAL=1 $cron_src >/dev/null 2>&1"
  if [[ "$(id -u)" -eq 0 ]]; then
    echo "$cron_line" > /etc/cron.d/bible-web-hijack-check
    chmod 644 /etc/cron.d/bible-web-hijack-check
    log "  ✓ 已安装 /etc/cron.d/bible-web-hijack-check（含 AUTO_HEAL）"
  else
    log "⚠️  INSTALL_HIJACK_CRON=1 需要 root 写 /etc/cron.d；请手动："
    log "   echo '$cron_line' | sudo tee /etc/cron.d/bible-web-hijack-check"
  fi
fi
