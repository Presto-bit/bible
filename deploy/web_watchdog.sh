#!/usr/bin/env bash
# bible-web 探活：本机 :3002 无响应则重启 web（带冷却，避免抖振）
# 由 harden_runtime.sh 写入 root crontab：每分钟一次
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PORT="${WEB_HOST_PORT:-3002}"
LOCK_DIR="${TMPDIR:-/tmp}/bible-web-watchdog.lock"
COOLDOWN_FILE="${TMPDIR:-/tmp}/bible-web-watchdog.cooldown"
COOLDOWN_SEC="${WATCHDOG_COOLDOWN_SEC:-300}" # 两次重启至少间隔 5 分钟
LOG_FILE="${WATCHDOG_LOG:-/var/log/bible-web-watchdog.log}"
COMPOSE_FILE="${APP_ROOT}/docker-compose.prod.yml"
ENV_FILE="${APP_ROOT}/.env.production"

log() {
  local line="[$(date '+%F %T')] $*"
  echo "${line}" >> "${LOG_FILE}" 2>/dev/null || echo "${line}" >&2
}

# 非阻塞锁：上一轮还在 restart 则跳过
if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "${LOCK_DIR}" 2>/dev/null || true' EXIT

if curl -fsS -m 5 "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
  exit 0
fi

now="$(date +%s)"
if [[ -f "${COOLDOWN_FILE}" ]]; then
  last="$(cat "${COOLDOWN_FILE}" 2>/dev/null || echo 0)"
  if [[ $((now - last)) -lt "${COOLDOWN_SEC}" ]]; then
    log "web :${WEB_PORT} 无响应，但仍在冷却期内，跳过 restart"
    exit 0
  fi
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  log "找不到 ${COMPOSE_FILE}，放弃"
  exit 1
fi

log "web :${WEB_PORT} 探活失败 → docker compose restart web"
echo "${now}" > "${COOLDOWN_FILE}"

cd "${APP_ROOT}"
compose=(docker compose -f "${COMPOSE_FILE}")
if [[ -f "${ENV_FILE}" ]]; then
  compose+=(--env-file "${ENV_FILE}")
fi
if ! "${compose[@]}" restart web >>"${LOG_FILE}" 2>&1; then
  log "restart web 失败，尝试 up -d web"
  "${compose[@]}" up -d web >>"${LOG_FILE}" 2>&1 || log "up -d web 仍失败"
fi

# 给启动留一点时间再记一笔
sleep 8
if curl -fsS -m 8 "http://127.0.0.1:${WEB_PORT}/" >/dev/null 2>&1; then
  log "web 已恢复"
else
  log "web 重启后仍无响应，请人工检查：docker compose logs --tail=80 web"
fi
