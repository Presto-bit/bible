#!/usr/bin/env bash
# 定时/手工：探测本机与公网 Web 是否被外域劫持跳转。
# cron 示例：* * * * * root APP_DIR=/opt/bible /opt/bible/scripts/check_web_hijack.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bible}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"
WEB_HOST_PORT="${WEB_HOST_PORT:-3002}"
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
        # 与 PUBLIC_WEB_URL 主域一致则放行
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

failed=0
check_one "http://127.0.0.1:${WEB_HOST_PORT}/login" || failed=1
check_one "http://127.0.0.1:${WEB_HOST_PORT}/" || failed=1
check_one "${pub_url%/}/login" || failed=1
exit "$failed"
