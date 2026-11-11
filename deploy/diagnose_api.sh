#!/usr/bin/env bash
# bible-api unhealthy / 启动失败快速诊断（在部署机仓库根目录执行）
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_DIR"

echo "=== docker compose ps (api / worker) ==="
docker compose -f docker-compose.prod.yml ps api api-worker 2>/dev/null || docker ps -a --filter name=bible-api

echo ""
echo "=== bible-api 状态与退出码 ==="
docker inspect bible-api --format 'Status={{.State.Status}} ExitCode={{.State.ExitCode}} OOM={{.State.OOMKilled}} Restarting={{.State.Restarting}}' 2>/dev/null || true

echo ""
echo "=== Health（最近 5 条）==="
docker inspect bible-api --format '{{json .State.Health}}' 2>/dev/null | python3 -m json.tool 2>/dev/null || true

echo ""
echo "=== 最近日志（api）==="
docker logs bible-api --tail 120 2>&1 || true

echo ""
echo "=== 容器内探活 ==="
docker exec bible-api curl -fsS -m 3 http://127.0.0.1:8011/health 2>&1 || echo "(curl 失败：进程可能未监听 8011)"

echo ""
echo "=== 尝试导入 app.main ==="
docker exec bible-api python -c "from app.main import app; print('import ok', app.title)" 2>&1 || true

echo ""
echo "=== DATABASE_URL host（脱敏）==="
docker exec bible-api printenv DATABASE_URL 2>/dev/null | sed -E 's#(postgresql://[^:]+:)[^@]+#\1***#' || true

echo ""
echo "提示：若日志停在 [entrypoint] 生成 bible_*.sqlite，多为经文库生成失败；已修复为不阻断启动，请 pull 最新 deploy/api-entrypoint.sh。"
