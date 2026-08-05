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
#   STRICT_PUBLIC=0|1      默认 1：重建 web 后公网 app-version/sw 必须与本机一致，否则失败
#   RECREATE_WEB=0|1       默认 1：重建 web 镜像后 --force-recreate 容器（避免旧进程挂着）
#   INSTALL_HIJACK_CRON=1  安装每分钟劫持探测+自愈 cron（默认 0）
#   SKIP_SW_CHECK=1        跳过 SW 烙印 / Cache-Control 门禁（默认 0；紧急回滚时可开）
#
# SW / TWA 立刻吃新包（本脚本 + Dockerfile + 客户端共同保证）：
#   1) 构建把 public/sw.js 的 CACHE 重写为 presto-bible-${NEXT_PUBLIC_APP_VERSION}
#   2) 发版后校验本机/公网 sw.js 含该 CACHE，且响应头 no-cache|no-store
#   3) 首页 meta app-version 必须等于本次构建 SHA（本机硬失败；公网默认 STRICT_PUBLIC）
#   4) 客户端 PwaRegister updateViaCache:none + 可见时 reg.update + controllerchange 刷新
#   5) 重建 web 时强制 recreate 容器 + 本机/公网版本对账（减少「发了但前端没变」）
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
STRICT_PUBLIC="${STRICT_PUBLIC:-1}"
RECREATE_WEB="${RECREATE_WEB:-1}"
INSTALL_HIJACK_CRON="${INSTALL_HIJACK_CRON:-0}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
RELEASE_SHA_FILE=".release-sha"

RELEASE_T0=$SECONDS
log() { echo "[$(date +'%F %T')] (+$((SECONDS - RELEASE_T0))s) $*"; }
die() { echo "❌ $*" >&2; exit 1; }

# 允许的跳转目标主机（与 PUBLIC_WEB_URL / 本机一致）；其它外域 Location 视为劫持
WEB_HIJACK_DENY_RE='rebirthstress|stresser|booter|register\?ref='

# SW CACHE 名中的版本片段（与 Dockerfile 内 tr -c 'A-Za-z0-9._-' 对齐）
sw_cache_version_token() {
  printf '%s' "${1:-}" | tr -c 'A-Za-z0-9._-' '-' | sed 's/-\+/-/g;s/^-//;s/-$//'
}

# 从 HTML 抽出 meta app-version
html_app_version() {
  printf '%s' "${1:-}" | grep -oE 'name=["'\'']app-version["'\''] content=["'\''][^"'\'']+["'\'']|content=["'\''][^"'\'']+["'\''] name=["'\'']app-version["'\'']' \
    | head -1 \
    | sed -E 's/.*content=["'\'']([^"'\'']+)["'\''].*/\1/'
}

# 校验已部署的 sw.js：CACHE 与某版本烙印一致 + 响应禁止长期缓存
# $1=基址  $2=标签  $3=期望版本 token（git short 等）  $4=strict
assert_sw_fresh() {
  local base="${1%/}"
  local label="$2"
  local expect_tok="$3"
  local strict="${4:-1}"
  local sw_url body headers code cache_h fail_msg bust

  if [[ "${SKIP_SW_CHECK:-0}" == "1" ]]; then
    log "  ⊘ SKIP_SW_CHECK=1，跳过 $label SW 检查"
    return 0
  fi

  if [[ -z "$expect_tok" || "$expect_tok" == "dev" || "$expect_tok" == "unknown" ]]; then
    fail_msg="$label 期望 SW 版本 token 无效（${expect_tok:-empty}）"
    if [[ "$strict" == "1" ]]; then die "$fail_msg"; fi
    log "⚠️  $fail_msg"
    return 0
  fi

  # 绕过中间层精确路径缓存：带 _nc 再取一份对照
  bust="_nc=$(date +%s)"
  sw_url="${base}/sw.js?${bust}"
  headers="$(curl -sSI --connect-timeout 5 --max-time 20 --max-redirs 0 "$sw_url" 2>/dev/null || true)"
  code="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'toupper($1) ~ /^HTTP\//{print $2; exit}')"
  cache_h="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'tolower($1)=="cache-control:"{print; exit}')"
  body="$(curl -fsS --connect-timeout 5 --max-time 20 --max-redirs 0 "$sw_url" 2>/dev/null || true)"

  if [[ "$code" != "200" && "$code" != "304" ]]; then
    # 回退无 query（部分反代对查询串异常）
    sw_url="${base}/sw.js"
    headers="$(curl -sSI --connect-timeout 5 --max-time 20 --max-redirs 0 "$sw_url" 2>/dev/null || true)"
    code="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'toupper($1) ~ /^HTTP\//{print $2; exit}')"
    cache_h="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'tolower($1)=="cache-control:"{print; exit}')"
    body="$(curl -fsS --connect-timeout 5 --max-time 20 --max-redirs 0 "$sw_url" 2>/dev/null || true)"
  fi

  if [[ "$code" != "200" && "$code" != "304" ]]; then
    fail_msg="$label sw.js HTTP ${code:-?}（期望 200）"
    if [[ "$strict" == "1" ]]; then die "$fail_msg"; fi
    log "⚠️  $fail_msg"
    return 1
  fi
  if [[ -z "$body" ]]; then
    fail_msg="$label 无法拉取 sw.js 正文"
    if [[ "$strict" == "1" ]]; then die "$fail_msg"; fi
    log "⚠️  $fail_msg"
    return 1
  fi
  # 勿用 `printf | grep -q`：pipefail 下 grep -q 早退会让 printf 吃 SIGPIPE(141)，误报烙印不符
  local expect_cache="presto-bible-${expect_tok}"
  local expect_assign="const CACHE = '${expect_cache}'"
  if [[ "$body" != *"$expect_assign"* ]]; then
    local got=""
    if [[ "$body" =~ const[[:space:]]+CACHE[[:space:]]*=[[:space:]]*[\'\"]presto-bible-([^\'\"]+)[\'\"] ]]; then
      got="presto-bible-${BASH_REMATCH[1]}"
    fi
    fail_msg="$label sw.js CACHE 烙印不符（期望 ${expect_cache}，实际 ${got:-未解析}）"
    if [[ "$strict" == "1" ]]; then die "$fail_msg"; fi
    log "⚠️  $fail_msg"
    return 1
  fi
  local cache_lc
  cache_lc="$(printf '%s' "$cache_h" | tr '[:upper:]' '[:lower:]')"
  if [[ ! "$cache_lc" =~ (no-store|no-cache|max-age=0|must-revalidate) ]]; then
    fail_msg="$label sw.js Cache-Control 过宽（${cache_h:-缺失}）。浏览器会迟迟不下新 SW；应 no-store/no-cache（见 next.config + nginx location = /sw.js）"
    if [[ "$strict" == "1" ]]; then die "$fail_msg"; fi
    log "⚠️  $fail_msg"
    return 1
  fi
  log "  ✓ $label sw.js CACHE=presto-bible-${expect_tok}，${cache_h:-Cache-Control ok}"
  return 0
}

# 风景壁纸须能被浏览器长缓存；nginx location / 若 no-cache always 会盖掉 Next headers
# 仅告警不阻断（避免未 reload nginx 的发版全失败）
# $1=base URL  $2=label
assert_wallpaper_long_cache() {
  local base="${1%/}"
  local label="$2"
  local url="${base}/daily-wallpapers/scenery-01.jpg"
  local headers code cache_h cache_lc x_cache
  headers="$(curl -sSI --connect-timeout 5 --max-time 20 --max-redirs 0 "$url" 2>/dev/null || true)"
  code="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'toupper($1) ~ /^HTTP\//{print $2; exit}')"
  cache_h="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'tolower($1)=="cache-control:"{print; exit}')"
  x_cache="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'tolower($1)=="x-bible-cache:"{print $2; exit}')"
  cache_lc="$(printf '%s' "$cache_h" | tr '[:upper:]' '[:lower:]')"

  if [[ "$code" != "200" && "$code" != "304" ]]; then
    log "⚠️  $label 壁纸探测 HTTP ${code:-?}（$url）— 不校验 Cache-Control"
    return 1
  fi
  # 期望 public + 较长 max-age；禁止仅有 no-store/no-cache 而无可缓存指令
  if [[ "$cache_lc" =~ max-age=([0-9]+) ]] && [[ "${BASH_REMATCH[1]}" -ge 86400 ]]; then
    log "  ✓ $label 壁纸 Cache-Control 可长缓存（${cache_h}${x_cache:+; X-Bible-Cache=$x_cache}）"
    return 0
  fi
  if [[ "$cache_lc" =~ (no-store|no-cache) ]]; then
    log "⚠️  $label 壁纸仍为短/无缓存（${cache_h:-缺失}）。Nginx location / 的 no-cache 可能盖住了 Next；请合并 deploy/nginx-*.conf 中 ^~ /daily-wallpapers/ 与 /rail-scenes/ 后 nginx -t && reload"
    return 1
  fi
  log "⚠️  $label 壁纸 Cache-Control 过短或缺失（${cache_h:-无}）；期望 max-age≥86400（见 deploy/nginx + next.config）"
  return 1
}

# 轮询本机首页直到 app-version 就绪（Next 冷启 / 容器 recreate 后短暂空窗）
# $1=期望版本  $2=最大秒数  打印最新 HTML 到 stdout（仅最后成功那次的 body 由全局变量带回不方便 → 用文件）
wait_local_app_version() {
  local expect="$1"
  local max_s="${2:-40}"
  local i html ver
  local out="/tmp/bible-release-home-$$.html"
  for i in $(seq 1 "$max_s"); do
    html="$(curl -fsS --connect-timeout 2 --max-time 8 --max-redirs 0 \
      -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
      "http://127.0.0.1:${WEB_HOST_PORT}/?_nc=${i}$(date +%s)" 2>/dev/null || true)"
    if [[ -n "$html" ]]; then
      printf '%s' "$html" > "$out"
      ver="$(html_app_version "$html")"
      if [[ -n "$ver" && ( -z "$expect" || "$ver" == "$expect" ) ]]; then
        HOME_HTML_FILE="$out"
        SERVED_APP_VERSION_WAIT="$ver"
        return 0
      fi
      if [[ -n "$ver" && -n "$expect" && "$ver" != "$expect" ]]; then
        [[ $((i % 5)) -eq 0 ]] && log "  本机 app-version=$ver，等待 $expect… (${i}/${max_s})"
      fi
    else
      [[ $((i % 5)) -eq 0 ]] && log "  本机首页未就绪 (${i}/${max_s})…"
    fi
    sleep 1
  done
  HOME_HTML_FILE="$out"
  SERVED_APP_VERSION_WAIT="$(html_app_version "$(cat "$out" 2>/dev/null || true)")"
  return 1
}

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
     STRICT_PUBLIC='${STRICT_PUBLIC:-1}' RECREATE_WEB='${RECREATE_WEB:-1}' \
     INSTALL_HIJACK_CRON='$INSTALL_HIJACK_CRON' SKIP_SW_CHECK='${SKIP_SW_CHECK:-0}' \
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

# 必须 export：docker compose 把 ${NEXT_PUBLIC_APP_VERSION} 注入 web 镜像（Dockerfile 烙 SW CACHE）
export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
log "Web 构建版本: $NEXT_PUBLIC_APP_VERSION（SW CACHE → presto-bible-$(sw_cache_version_token "$NEXT_PUBLIC_APP_VERSION")）"

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
          '^(apps/web/|apps/web/Dockerfile|shared/|data/illustrations/|package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|docker-compose\.prod\.yml)'; then
          need_web=1
        fi
        # 壳 APK / downloads 静态资源进 web public：须随站点发
        if echo "$changed" | grep -qE \
          '^(apps/web/public/|apps/android-twa/(app/build\.gradle\.kts|twa-manifest\.json)$)'; then
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
if [[ "$need_web" == "1" && "$RECREATE_WEB" == "1" ]]; then
  # 仅 up -d 时，compose 若认为 config 未变可能不换进程；强制 recreate 保证新镜像运行
  log "重建 web 镜像后 force-recreate web（RECREATE_WEB=1）"
  "${compose[@]}" up -d || die "docker compose up 失败"
  "${compose[@]}" up -d --force-recreate --no-deps web || die "docker compose force-recreate web 失败"
else
  "${compose[@]}" up -d || die "docker compose up 失败"
fi

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
# 注意：bash $RANDOM 仅 0–32767，拼出的「8 位码」实际落在 ~3 万个值，易撞历史冒烟账号 → 403 无权恢复
gen_smoke_user_code() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import secrets; print(f"{secrets.randbelow(90_000_000) + 10_000_000:08d}")'
  else
    od -An -N4 -tu4 /dev/urandom | tr -d ' \n' | awk '{ printf "%08d\n", ($1 % 90000000) + 10000000 }'
  fi
}

smoke_token=""
reg_body=""
smoke_code=""
for _smoke_try in 1 2 3 4 5; do
  smoke_code="$(gen_smoke_user_code)"
  reg_body="$(curl -sS -X POST "${api_base_local}/auth/register" \
    -H "Content-Type: application/json" \
    -H "X-Device-Id: ${smoke_device}" \
    -d "{\"user_code\":\"${smoke_code}\"}" 2>/dev/null || true)"
  if command -v python3 >/dev/null 2>&1; then
    smoke_token="$(printf '%s' "$reg_body" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("session_token") or "")' 2>/dev/null || true)"
  elif command -v jq >/dev/null 2>&1; then
    smoke_token="$(printf '%s' "$reg_body" | jq -r '.session_token // empty' 2>/dev/null || true)"
  fi
  [[ -n "$smoke_token" ]] && break
done

if [[ -z "$smoke_token" ]]; then
  log "register 响应片段: $(printf '%s' "$reg_body" | head -c 300)"
  die "无法签发冒烟会话（register 未返回 session_token）。若为「无权恢复此账号」多为 user_code 碰撞；否则检查 SESSION_TOKEN_SECRET"
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
HOME_HTML_FILE=""
SERVED_APP_VERSION_WAIT=""
log "等待本机首页 app-version（避免 recreate 后立刻 curl 仍命中旧进程空窗）"
if [[ "$need_web" == "1" ]]; then
  if ! wait_local_app_version "$NEXT_PUBLIC_APP_VERSION" 45; then
    die "本机首页在 45s 内未变为 app-version=$NEXT_PUBLIC_APP_VERSION（当前 ${SERVED_APP_VERSION_WAIT:-空}）。web 未换新镜像？试 WEB_BUILD_NO_CACHE=1 FORCE_FULL=1"
  fi
else
  wait_local_app_version "" 20 || true
fi

home_html=""
if [[ -n "${HOME_HTML_FILE:-}" && -f "$HOME_HTML_FILE" ]]; then
  home_html="$(cat "$HOME_HTML_FILE" 2>/dev/null || true)"
fi
if [[ -z "$home_html" ]]; then
  home_html="$(curl -fsS --max-redirs 0 -H 'Cache-Control: no-cache' \
    "http://127.0.0.1:${WEB_HOST_PORT}/?_nc=$(date +%s)" 2>/dev/null || true)"
fi
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

served_app_version="$(html_app_version "$home_html")"
served_app_version="${served_app_version:-$SERVED_APP_VERSION_WAIT}"
served_sw_tok="$(sw_cache_version_token "${served_app_version:-}")"

if [[ "$need_web" == "1" ]]; then
  if [[ -z "$served_app_version" || "$served_app_version" != "$NEXT_PUBLIC_APP_VERSION" ]]; then
    die "本机首页 app-version=${served_app_version:-?} ≠ 本次构建 $NEXT_PUBLIC_APP_VERSION（web 未按该版本重建？设 WEB_BUILD_NO_CACHE=1 FORCE_FULL=1）"
  fi
  log "  ✓ 本机 app-version=$served_app_version（与本次构建一致）"
elif [[ -n "$served_app_version" && "$served_app_version" != "$NEXT_PUBLIC_APP_VERSION" ]]; then
  log "  ℹ 本次未重建 web：容器仍为 app-version=$served_app_version（git HEAD=$NEXT_PUBLIC_APP_VERSION）"
fi

if [[ -z "$served_app_version" || -z "$served_sw_tok" ]]; then
  die "本机首页缺少 meta app-version，无法校验 SW 烙印"
fi

log "SW 新鲜度：本机 sw.js 与容器 app-version=$served_app_version 一致"
assert_sw_fresh "http://127.0.0.1:${WEB_HOST_PORT}" "本机" "$served_sw_tok" 1

log "壁纸缓存：本机 daily-wallpapers 勿被反代 no-cache 盖掉"
assert_wallpaper_long_cache "http://127.0.0.1:${WEB_HOST_PORT}" "本机" || true

if [[ -n "$pub_url" ]]; then
  log "劫持检查：公网 Web"
  assert_web_not_hijacked "${pub_url%/}/" "公网 /"
  assert_web_not_hijacked "${pub_url%/}/login" "公网 /login"

  # 公网对账：无缓存 + 带 _nc；重建 web 时默认 STRICT_PUBLIC 硬失败
  pub_strict=0
  if [[ "$need_web" == "1" && "$STRICT_PUBLIC" == "1" ]]; then
    pub_strict=1
  fi

  pub_ver=""
  pub_bust_ver=""
  pub_ok=0
  for i in 1 2 3 4 5 6; do
    pub_home="$(curl -fsS --connect-timeout 5 --max-time 20 --max-redirs 0 \
      -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
      "${pub_url%/}/" 2>/dev/null || true)"
    pub_home_bust="$(curl -fsS --connect-timeout 5 --max-time 20 --max-redirs 0 \
      -H 'Cache-Control: no-cache' \
      "${pub_url%/}/?_nc=$(date +%s)${i}" 2>/dev/null || true)"
    pub_ver="$(html_app_version "$pub_home")"
    pub_bust_ver="$(html_app_version "$pub_home_bust")"

    if [[ -n "$pub_home" ]] && echo "$pub_home" | grep -qiE "$WEB_HIJACK_DENY_RE"; then
      die "公网首页 HTML 含劫持特征串"
    fi
    if [[ -n "$pub_home" ]] && echo "$pub_home" | grep -q '3,842'; then
      if [[ -n "$pub_home_bust" ]] && ! echo "$pub_home_bust" | grep -q '3,842'; then
        msg="公网 / 仍旧版，但 /?_nc= 已是新版 → 宝塔/Nginx 缓存了精确路径 /"
        if [[ "$pub_strict" == "1" ]]; then
          die "$msg（STRICT_PUBLIC=1）。处理：关全站缓存 + location = / no-cache + nginx -s reload"
        fi
        log "⚠️  $msg"
      else
        msg="公网 / 仍是旧版（含 3,842）"
        if [[ "$pub_strict" == "1" ]]; then die "$msg"; fi
        log "⚠️  $msg"
      fi
    fi

    # 重建 web 时期望公网至少 _nc 一致；裸 / 也应尽快一致
    if [[ -n "$served_app_version" ]]; then
      if [[ "$pub_bust_ver" == "$served_app_version" ]]; then
        if [[ "$pub_ver" == "$served_app_version" || -z "$pub_ver" ]]; then
          pub_ok=1
          break
        fi
        # 裸 / 仍旧但 _nc 已新：反代缓存 /，严格模式失败
        if [[ -n "$pub_ver" && "$pub_ver" != "$served_app_version" ]]; then
          log "  公网 / =$pub_ver，/?_nc= =$pub_bust_ver（等反代失效 ${i}/6）…"
        else
          pub_ok=1
          break
        fi
      elif [[ "$pub_ver" == "$served_app_version" ]]; then
        pub_ok=1
        break
      else
        log "  公网版本对账中：/=$pub_ver _nc=$pub_bust_ver 期望=$served_app_version（${i}/6）…"
      fi
    fi
    sleep 2
  done

  if [[ "$need_web" == "1" ]]; then
    if [[ "$pub_ok" != "1" ]]; then
      msg="公网未同步到 app-version=$served_app_version（/=${pub_ver:-?} _nc=${pub_bust_ver:-?}）。检查反代端口 ${WEB_HOST_PORT} / 缓存；或 STRICT_PUBLIC=0 临时跳过"
      if [[ "$pub_strict" == "1" ]]; then die "$msg"; fi
      log "⚠️  $msg"
    elif [[ -n "$pub_ver" && "$pub_ver" != "$served_app_version" && "$pub_bust_ver" == "$served_app_version" ]]; then
      msg="公网裸 / 仍缓存旧 HTML（$pub_ver），但 /?_nc 已是 $served_app_version → 必须清 Nginx 对 / 的缓存，否则 TWA 冷启仍旧"
      if [[ "$pub_strict" == "1" ]]; then die "$msg"; fi
      log "⚠️  $msg"
    else
      log "公网首页版本校验通过（app-version=${pub_ver:-$pub_bust_ver}）"
    fi
  else
    if [[ -n "$pub_ver" && "$pub_ver" != "$served_app_version" ]]; then
      log "⚠️  公网 app-version=$pub_ver ≠ 本机容器 $served_app_version（本次未重建 web 时可忽略）"
    elif [[ -n "$pub_ver" ]]; then
      log "公网首页版本校验通过（app-version=$pub_ver）"
    fi
  fi

  log "SW 新鲜度：公网 sw.js（应对齐本机容器烙印）"
  assert_sw_fresh "${pub_url}" "公网" "$served_sw_tok" "$pub_strict" || true
  assert_wallpaper_long_cache "${pub_url}" "公网" || true
fi

log "发布成功（耗时 $((SECONDS - RELEASE_T0))s）"
log "  API: http://127.0.0.1:8011/health"
log "  Web: http://127.0.0.1:${WEB_HOST_PORT}/  →  https://2sc.prestoai.cn/"
log "  app-version(容器): $served_app_version"
log "  SW CACHE: presto-bible-${served_sw_tok}"
if [[ "$need_web" == "1" ]]; then
  log "  本次已重建 web → 客户端应能扫到新 SW（PwaRegister update + controllerchange）"
  log "  TWA 仍旧时：我的→常用→缓存→清除缓存并刷新；或系统清除应用存储"
else
  log "  本次未重建 web → TWA 前端/SW 与上次相同（仅 API 等变更）"
fi
log "若前有 Nginx/CDN，请确认 / 与 /sw.js 不缓存（见 DEPLOYMENT.md §SW）"
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
