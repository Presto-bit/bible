#!/usr/bin/env bash
# 对已存在的 Postgres 卷补跑 init 脚本（幂等）
# 用法：cd /opt/bible && bash scripts/ensure_pg_schema.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bible}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

log() { echo "[ensure_pg_schema] $*"; }
die() { echo "[ensure_pg_schema] ❌ $*" >&2; exit 1; }

cd "$APP_DIR"
[[ -f "$COMPOSE_FILE" ]] || die "缺少 $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "缺少 $ENV_FILE"

DB_USER=bible
DB_NAME=bible
if grep -qE '^DB_USER=' "$ENV_FILE" 2>/dev/null; then
  DB_USER="$(grep -E '^DB_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi
if grep -qE '^DB_NAME=' "$ENV_FILE" 2>/dev/null; then
  DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

if ! "${compose[@]}" ps -q --status running postgres &>/dev/null; then
  die "postgres 容器未运行，请先 docker compose up -d postgres"
fi

MIGRATIONS=(
  infra/postgres/init/001_bible_rag.sql
  infra/postgres/init/002_user_sync.sql
  infra/postgres/init/003_social.sql
  infra/postgres/init/003_plan_session.sql
  infra/postgres/init/003_read_events_badges.sql
  infra/postgres/init/004_accounts.sql
  infra/postgres/init/005_daily_verse_engagement.sql
  infra/postgres/init/006_social_group_meta.sql
  infra/postgres/init/007_user_share.sql
  infra/postgres/init/008_social_extras.sql
  infra/postgres/init/009_push_subscription.sql
  infra/postgres/init/010_group_enhance.sql
  infra/postgres/init/011_group_member_nickname.sql
  infra/postgres/init/012_device_user_binding.sql
  infra/postgres/init/013_accounts_phone.sql
  infra/postgres/init/013_group_invite.sql
  infra/postgres/init/014_daily_uv.sql
  infra/postgres/init/015_bible_rag_pgvector.sql
  infra/postgres/init/016_hero_b_campaign.sql
  infra/postgres/init/017_ai_request_log.sql
  infra/postgres/init/018_daily_uv_v2.sql
  infra/postgres/init/020_group_task_v2.sql
  infra/postgres/init/021_social_im_v12.sql
)

for sql in "${MIGRATIONS[@]}"; do
  [[ -f "$sql" ]] || die "缺少迁移文件: $sql"
  log "应用 $sql"
  # pgvector 为可选扩展：无扩展时跳过，不阻断后续迁移
  if [[ "$sql" == *015_bible_rag_pgvector.sql ]]; then
    if ! "${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$sql"; then
      log "跳过 $sql（可能未安装 vector 扩展）"
    fi
    continue
  fi
  "${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$sql"
done

log "校验关键表与列"
"${compose[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE WHEN COUNT(*) = 6 THEN 'ok' ELSE 'missing' END AS check_core_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'accounts', 'social_group',
    'daily_verse_like', 'daily_verse_share', 'plan_progress'
  );

SELECT CASE WHEN COUNT(*) = 1 THEN 'ok' ELSE 'missing' END AS check_user_share
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_share';

SELECT CASE WHEN COUNT(*) = 1 THEN 'ok' ELSE 'missing' END AS check_plan_session_col
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'plan_progress'
  AND column_name = 'session';

SELECT CASE WHEN COUNT(*) = 2 THEN 'ok' ELSE 'missing' END AS check_read_event_badge
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('read_event', 'badge_unlock');

SELECT CASE WHEN COUNT(*) >= 5 THEN 'ok' ELSE 'missing' END AS check_group_task_v2_cols
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'group_task'
  AND column_name IN ('task_type', 'completion_rule', 'status', 'publish_at', 'source');

SELECT CASE WHEN COUNT(*) = 3 THEN 'ok' ELSE 'missing' END AS check_group_task_v2_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('group_task_series', 'group_task_attachment', 'group_task_assignee');

SELECT CASE WHEN COUNT(*) = 1 THEN 'ok' ELSE 'missing' END AS check_daily_uv
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'daily_active_visitors';

SELECT CASE WHEN COUNT(*) >= 2 THEN 'ok' ELSE 'missing' END AS check_daily_uv_v2
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'daily_active_visitors'
  AND column_name IN ('device_fingerprint', 'user_id');
SQL

log "完成 — 可验证："
log "  curl -s 'http://127.0.0.1:8011/sync/pull?since=0' -H 'X-User-Code: 1234567890'"
log "  curl -s -X POST http://127.0.0.1:8011/content/daily-verse/like -H 'X-User-Code: 1234567890'"
log "  curl -s http://127.0.0.1:8011/social/groups -H 'X-User-Code: 1234567890'"
