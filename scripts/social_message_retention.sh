#!/usr/bin/env bash
# 社交消息 30 天清理（调用 API /social/retention/run）
# 一般由 deploy/cron/install_cron.sh 内 curl 触发；亦可手动：bash scripts/social_message_retention.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/bible}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.production}"
API="${API_BASE:-http://127.0.0.1:8011}"

# shellcheck source=../deploy/cron/push_cron_secret.sh
source "$(cd "$(dirname "$0")/.." && pwd)/deploy/cron/push_cron_secret.sh"
PUSH_CRON_SECRET="$(bible_resolve_push_cron_secret "$ENV_FILE")"

curl -fsS -X POST "$API/social/retention/run" \
  -H "X-Cron-Secret: $PUSH_CRON_SECRET" \
  -H "Content-Type: application/json"
echo
