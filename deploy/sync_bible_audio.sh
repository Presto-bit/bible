#!/usr/bin/env bash
# 将本地 data/bible_audio/ 同步到生产服务器（方案 1：API 不出网，只读本地缓存）
#
# 用法（在有外网的本机，先 mirror 再 sync）：
#   python scripts/mirror_bible_audio.py --all --workers 4
#   DEPLOY_SSH=presto@8.152.6.105 bash deploy/sync_bible_audio.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="${ROOT}/data/bible_audio/"
DEPLOY_SSH="${DEPLOY_SSH:-presto@8.152.6.105}"
REMOTE_DIR="${REMOTE_DIR:-/opt/bible/data/bible_audio}"

if [[ ! -d "$SRC" ]]; then
  echo "缺少本地目录: $SRC"
  echo "请先运行: python scripts/mirror_bible_audio.py --all"
  exit 1
fi

echo "同步 ${SRC} → ${DEPLOY_SSH}:${REMOTE_DIR}/"
rsync -avz --progress --delete "${SRC}" "${DEPLOY_SSH}:${REMOTE_DIR}/"

echo ""
echo "请在服务器 .env.production 中确认："
echo "  BIBLE_AUDIO_OFFLINE=1"
echo "  BIBLE_AUDIO_STORAGE_DIR=/app/data/bible_audio"
echo ""
echo "并确保 docker-compose.prod.yml 已挂载："
echo "  - ${REMOTE_DIR}:/app/data/bible_audio"
echo ""
echo "然后重建 API："
echo "  cd /opt/bible && docker compose -f docker-compose.prod.yml up -d --build api"
