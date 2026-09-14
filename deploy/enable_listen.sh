#!/usr/bin/env bash
# 现网开通 AI 听经：Nginx 代理 /listen + 重建 API（含 MINIMAX_API_KEY）
# 在服务器执行：
#   cd /opt/bible && bash deploy/enable_listen.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NGINX_CONF="${NGINX_CONF:-/www/server/panel/vhost/nginx/2sc.prestoai.cn.conf}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

echo "→ 检查/写入 MINIMAX_API_KEY 到 $ENV_FILE"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE"
  exit 1
fi
if ! grep -q '^MINIMAX_API_KEY=' "$ENV_FILE"; then
  echo '' >> "$ENV_FILE"
  echo '# AI 听经 MiniMax' >> "$ENV_FILE"
  echo 'MINIMAX_API_KEY=' >> "$ENV_FILE"
  echo "请先编辑 $ENV_FILE 填入 MINIMAX_API_KEY 后重跑"
  exit 1
fi
if grep -q '^MINIMAX_API_KEY=$' "$ENV_FILE" || grep -q '^MINIMAX_API_KEY=["'\'']*["'\'']$' "$ENV_FILE"; then
  echo "MINIMAX_API_KEY 为空，请写入后重跑"
  exit 1
fi
if ! grep -q '^LISTEN_STORAGE_DIR=' "$ENV_FILE"; then
  echo 'LISTEN_STORAGE_DIR=/app/data/listen_cache' >> "$ENV_FILE"
fi

echo "→ 更新 Nginx 代理规则加入 listen"
if [[ -f "$NGINX_CONF" ]]; then
  if grep -q '|listen|' "$NGINX_CONF" || grep -Eq '\(bible\|guide\|[^)]*listen' "$NGINX_CONF"; then
    echo "  Nginx 已含 listen"
  else
    # 常见宝塔片段：在 health 后插入 listen
    if grep -q 'health|docs' "$NGINX_CONF"; then
      sed -i.bak 's/health|docs/health|listen|docs/g' "$NGINX_CONF"
    elif grep -q 'health|docs|openapi' "$NGINX_CONF"; then
      sed -i.bak 's/health|docs|openapi/health|listen|docs|openapi/g' "$NGINX_CONF"
    else
      echo "无法自动识别 Nginx location 正则，请手工把 listen 加入 API 代理组："
      echo "  $NGINX_CONF"
      exit 1
    fi
    nginx -t
    nginx -s reload
    echo "  Nginx 已 reload"
  fi
else
  echo "未找到 $NGINX_CONF，跳过 Nginx（请确认宝塔站点已代理 /listen）"
fi

echo "→ git pull + 重建 API"
git fetch --all --prune
git pull --ff-only
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build api

echo "→ 冒烟"
sleep 2
curl -fsS "http://127.0.0.1:8011/listen/voices" | head -c 200 || true
echo
curl -sS -o /dev/null -w "public /listen/voices → %{http_code}\n" "https://2sc.prestoai.cn/listen/voices" || true
echo "✓ 完成：若公网仍 404，检查宝塔 Nginx 是否生效"
