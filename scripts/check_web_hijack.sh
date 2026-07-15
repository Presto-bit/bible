#!/usr/bin/env bash
# 定时/手工：探测本机与公网 Web 是否被外域劫持跳转。
# 发现劫持时可自动重建 web（AUTO_HEAL=1），避免等人手工 release。
#
# cron 示例（推荐带自愈）：
#   * * * * * root APP_DIR=/opt/bible AUTO_HEAL=1 /opt/bible/scripts/check_web_hijack.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bible}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.prod.yml}"
WEB_HOST_PORT="${WEB_HOST_PORT:-3002}"
AUTO_HEAL="${AUTO_HEAL:-0}"
DENY_RE='rebirthstress|stresser|booter|register\?ref='

if [[ -f "$ENV_FILE" ]] && grep -qE '^WEB_HOST_PORT=' "$ENV_FILE"; then
  WEB_HOST_PORT="$(grep -E '^WEB_HOST_PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi
WEB_HOST_PORT="${WEB_HOST_PORT:-3002}"

pub_url=""
if [[ -f "$ENV_FILE" ]] && grep -qE '^PUBLIC_WEB_URL=' "$ENV_FILE"; then
  pub_url="$(grep -E '^PUBLIC_WEB_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi
pub_url="${pub_url:-https://2sc.prestoai.cn}"

check_one() {
  local url="$1"
  local headers loc
  headers="$(curl -sSI --connect-timeout 5 --max-time 12 --max-redirs 0 "$url" 2>/dev/null || true)"
  loc="$(printf '%s\n' "$headers" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2; exit}')"
  if printf '%s\n' "$headers"$'\n'"$loc" | grep -qiE "$DENY_RE"; then
    logger -t web-hijack "HIJACK $url -> ${loc:-?}"
    echo "HIJACK $url -> ${loc:-?}" >&2
    return 1
  fi
  if [[ -n "$loc" && "$loc" != /* ]]; then
    local host
    host="$(printf '%s' "$loc" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^/]+).*#\1#' | tr '[:upper:]' '[:lower:]')"
    case "$host" in
      localhost|127.0.0.1|2sc.prestoai.cn|www.2sc.prestoai.cn) ;;
      *)
        local allow
        allow="$(printf '%s' "${pub_url}" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://([^/]+).*#\1#' | tr '[:upper:]' '[:lower:]')"
        if [[ "$host" != "$allow" && "$host" != "www.$allow" ]]; then
          logger -t web-hijack "SUSPECT $url -> $loc"
          echo "SUSPECT $url -> $loc" >&2
          return 1
        fi
        ;;
    esac
  fi
  return 0
}

run_checks() {
  local failed=0
  check_one "http://127.0.0.1:${WEB_HOST_PORT}/login" || failed=1
  check_one "http://127.0.0.1:${WEB_HOST_PORT}/" || failed=1
  check_one "${pub_url%/}/login" || failed=1
  return "$failed"
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

heal_web() {
  logger -t web-hijack "AUTO_HEAL: force-recreate web"
  echo "AUTO_HEAL: force-recreate web" >&2
  (
    cd "$APP_DIR"
    compose up -d --force-recreate --no-deps web
  )
  sleep 12
  if run_checks; then
    logger -t web-hijack "AUTO_HEAL: recreate OK"
    return 0
  fi
  logger -t web-hijack "AUTO_HEAL: rebuild --no-cache web"
  echo "AUTO_HEAL: rebuild --no-cache web" >&2
  (
    cd "$APP_DIR"
    compose build --no-cache web
    compose up -d --force-recreate --no-deps web
  )
  sleep 20
  if run_checks; then
    logger -t web-hijack "AUTO_HEAL: rebuild OK"
    return 0
  fi
  logger -t web-hijack "AUTO_HEAL: FAILED — host may still be compromised"
  echo "AUTO_HEAL FAILED" >&2
  return 1
}

if run_checks; then
  exit 0
fi

if [[ "$AUTO_HEAL" == "1" ]]; then
  heal_web || exit 1
  exit 0
fi

exit 1
