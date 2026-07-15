#!/usr/bin/env bash
# 社交消息 30 天清理（调用 API /social/retention/run）
# cron 示例：15 3 * * * APP_DIR=/opt/bible /opt/bible/scripts/social_message_retention.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/bible}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"
API="${API_BASE:-http://127.0.0.1:8011}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # 只取 PUSH_CRON_SECRET，避免 source 整份 env 带副作用
  PUSH_CRON_SECRET="$(grep -E '^PUSH_CRON_SECRET=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  set +a
fi

if [[ -z "${PUSH_CRON_SECRET:-}" ]]; then
  echo "PUSH_CRON_SECRET missing" >&2
  exit 1
fi

curl -fsS -X POST "$API/social/retention/run" \
  -H "X-Cron-Secret: $PUSH_CRON_SECRET" \
  -H "Content-Type: application/json"
echo
