#!/usr/bin/env bash
# 本地一键发布：git push → SSH 到服务器执行 release.sh
#
# 1. 复制 deploy/publish.env.example → deploy/publish.env 并填写 DEPLOY_SSH
# 2. bash scripts/publish.sh
#
# 也可直接：
#   DEPLOY_SSH=ubuntu@1.2.3.4 DEPLOY_APP_DIR=/opt/bible-app bash scripts/publish.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
DEPLOY_APP_DIR="${DEPLOY_APP_DIR:-/opt/bible-app}"

if [[ -f "$ROOT/deploy/publish.env" ]]; then
  # shellcheck source=/dev/null
  source "$ROOT/deploy/publish.env"
fi

if [[ -z "${DEPLOY_SSH:-}" ]]; then
  echo "请配置 DEPLOY_SSH（例 ubuntu@your-ecs-ip）"
  echo "  cp deploy/publish.env.example deploy/publish.env"
  echo "  Git 仓库: https://github.com/Presto-bit/bible"
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "当前目录不是 Git 仓库。请先："
  echo "  git init"
  echo "  git remote add origin https://github.com/Presto-bit/bible.git"
  exit 1
fi

echo "→ git push $REMOTE $BRANCH"
git push "$REMOTE" "$BRANCH"

echo "→ SSH $DEPLOY_SSH 执行 release.sh"
ssh "$DEPLOY_SSH" "cd '$DEPLOY_APP_DIR' && bash release.sh"

echo "✓ 发布完成"
