#!/usr/bin/env bash
# 清除指定 user_code 的云端数据（登录、设备绑定、同步、社交等）
# 用法（在服务器 /opt/bible）：
#   CODE=63049660 bash scripts/wipe_user_code.sh
set -euo pipefail

CODE="${CODE:?请设置 CODE，例如 CODE=63049660}"
APP_DIR="${APP_DIR:-/opt/bible}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

# 与 services/api/app/auth/user_code.py 一致
UID_UUID="$(python3 - <<PY
import uuid
print(uuid.uuid5(uuid.UUID("6f1a0c2e-9b3d-4e7a-8c1f-b1b1e0000001"), "${CODE}"))
PY
)"

cd "$APP_DIR"
DB_USER=bible
DB_NAME=bible
if grep -qE '^DB_USER=' "$ENV_FILE" 2>/dev/null; then
  DB_USER="$(grep -E '^DB_USER=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi
if grep -qE '^DB_NAME=' "$ENV_FILE" 2>/dev/null; then
  DB_NAME="$(grep -E '^DB_NAME=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d ' \"\047')"
fi

compose=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

echo "[wipe] user_code=${CODE} user_id=${UID_UUID}"

"${compose[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
\\echo '=== before ==='
SELECT user_code, username, phone, (pwd_hash IS NOT NULL) AS has_password, user_id
FROM accounts WHERE user_code = '${CODE}';
SELECT device_fingerprint, user_code, updated_at
FROM device_user_bindings WHERE user_code = '${CODE}';
SELECT id, handle, display_name FROM users WHERE id = '${UID_UUID}';

BEGIN;

DELETE FROM device_user_bindings WHERE user_code = '${CODE}';
DELETE FROM accounts WHERE user_code = '${CODE}';
DELETE FROM daily_verse_like WHERE user_code = '${CODE}';
DELETE FROM daily_verse_share WHERE user_code = '${CODE}';

DELETE FROM user_note WHERE user_id = '${UID_UUID}';
DELETE FROM user_highlight WHERE user_id = '${UID_UUID}';
DELETE FROM user_bookmark WHERE user_id = '${UID_UUID}';
DELETE FROM memorize_card WHERE user_id = '${UID_UUID}';
DELETE FROM ai_session WHERE user_id = '${UID_UUID}';
DELETE FROM reading_progress WHERE user_id = '${UID_UUID}';
DELETE FROM reading_log WHERE user_id = '${UID_UUID}';
DELETE FROM plan_progress WHERE user_id = '${UID_UUID}';
DELETE FROM user_profile WHERE user_id = '${UID_UUID}';
DELETE FROM sync_cursor WHERE user_id = '${UID_UUID}';
DELETE FROM user_share WHERE user_id = '${UID_UUID}';
DELETE FROM push_subscription WHERE user_id = '${UID_UUID}';

DO \$\$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_usage_daily' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'DELETE FROM ai_usage_daily WHERE user_id = ''${UID_UUID}''';
  END IF;
END \$\$;

DELETE FROM friendship
WHERE user_id = '${UID_UUID}' OR friend_id = '${UID_UUID}';

DO \$\$
DECLARE
  gid uuid;
BEGIN
  FOR gid IN
    SELECT id FROM social_group WHERE owner_id = '${UID_UUID}'
  LOOP
    UPDATE social_group SET pinned_task_id = NULL WHERE id = gid;
    DELETE FROM group_message WHERE group_id = gid;
    DELETE FROM group_task WHERE group_id = gid;
    DELETE FROM group_member WHERE group_id = gid;
    DELETE FROM social_group WHERE id = gid;
  END LOOP;
END \$\$;

DELETE FROM group_member WHERE user_id = '${UID_UUID}';
DELETE FROM group_message WHERE user_id = '${UID_UUID}';
DELETE FROM group_task WHERE created_by = '${UID_UUID}';

DELETE FROM users WHERE id = '${UID_UUID}';

COMMIT;

\\echo '=== after ==='
SELECT COUNT(*) AS accounts_left FROM accounts WHERE user_code = '${CODE}';
SELECT COUNT(*) AS bindings_left FROM device_user_bindings WHERE user_code = '${CODE}';
SELECT COUNT(*) AS users_left FROM users WHERE id = '${UID_UUID}';
SQL

echo "[wipe] done — 两台设备请刷新或点「这不是我的账号，使用新 ID」"
