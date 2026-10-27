#!/usr/bin/env bash
# 安装彼爱生产 cron（消息 30 天清理 + 每日经文暖场）。在服务器上执行：
#   export PUSH_CRON_SECRET='...'   # 与 .env.production 一致
#   sudo -E bash deploy/cron/install_cron.sh
#
# 若服务器 crontab 为 UTC、业务按北京时间，请在 crontab 顶部加：TZ=Asia/Shanghai
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RETENTION_TAG="# bible-retention-cron"
WARM_TAG="# bible-daily-verse-warm-cron"
API_LOCAL="${API_LOCAL:-http://127.0.0.1:8011}"
RETENTION_LOG="${RETENTION_LOG:-/var/log/bible-retention.log}"
WARM_LOG="${WARM_LOG:-/var/log/bible-daily-verse-warm.log}"

if [[ -z "${PUSH_CRON_SECRET:-}" ]]; then
  echo "请先 export PUSH_CRON_SECRET=与生产一致的密钥" >&2
  exit 1
fi

RETENTION_LINE="20 4 * * * curl -fsS -X POST -H \"X-Cron-Secret: ${PUSH_CRON_SECRET}\" ${API_LOCAL}/social/retention/run >> ${RETENTION_LOG} 2>&1 ${RETENTION_TAG}"

# 暖场：默认日窗 6:00–23:00、每 30 分钟（与后台 cron_interval_minutes 默认一致）
WARM_LINE_1="*/30 6-22 * * * curl -fsS -X POST -H \"X-Cron-Secret: ${PUSH_CRON_SECRET}\" ${API_LOCAL}/content/cron/daily-verse-warm >> ${WARM_LOG} 2>&1 ${WARM_TAG}"
WARM_LINE_2="0 23 * * * curl -fsS -X POST -H \"X-Cron-Secret: ${PUSH_CRON_SECRET}\" ${API_LOCAL}/content/cron/daily-verse-warm >> ${WARM_LOG} 2>&1 ${WARM_TAG}"

existing="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "${existing}" | grep -v "${RETENTION_TAG}" | grep -v "${WARM_TAG}" || true)"
{
  printf '%s\n' "${filtered}"
  printf '%s\n' "${RETENTION_LINE}"
  printf '%s\n' "${WARM_LINE_1}"
  printf '%s\n' "${WARM_LINE_2}"
} | crontab -

echo "==> 已写入 crontab"
echo "    · 每日 04:20 retention"
echo "    · 每日经文暖场：6:00–22:30 每 30 分钟 + 23:00（需后台开启暖场开关）"
crontab -l | grep -E "${RETENTION_TAG}|${WARM_TAG}" || true
echo "==> 探针 retention：curl -fsS -X POST -H \"X-Cron-Secret: \$PUSH_CRON_SECRET\" ${API_LOCAL}/social/retention/run"
echo "==> 探针暖场：curl -fsS -X POST -H \"X-Cron-Secret: \$PUSH_CRON_SECRET\" ${API_LOCAL}/content/cron/daily-verse-warm"
echo "==> 确认 api-worker：docker ps --filter name=bible-api-worker"
echo "文档：${APP_ROOT}/docs/DEPLOY-RUNBOOK.md"
