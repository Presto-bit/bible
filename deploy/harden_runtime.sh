#!/usr/bin/env bash
# 生产运行时加固：swap + Web 探活自愈 cron（与 docker-compose.prod.yml 内存限额配套）
# 用法（服务器上）：
#   cd /opt/bible && sudo bash deploy/harden_runtime.sh
#   sudo bash deploy/harden_runtime.sh --swap-gb 2 --no-cron   # 仅 swap
set -euo pipefail

SWAP_GB=2
SWAPFILE="${SWAPFILE:-/swapfile-bible}"
INSTALL_CRON=1
APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRON_TAG="# bible-web-watchdog"
WATCHDOG="${APP_ROOT}/deploy/web_watchdog.sh"

usage() {
  cat <<'EOF'
用法: sudo bash deploy/harden_runtime.sh [选项]
  --swap-gb N     swap 大小（GiB），默认 2
  --swapfile PATH swap 文件路径，默认 /swapfile-bible
  --no-cron       不安装探活 cron
  --no-swap       不创建/调整 swap
  -h, --help
EOF
}

DO_SWAP=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --swap-gb) SWAP_GB="${2:?}"; shift 2 ;;
    --swapfile) SWAPFILE="${2:?}"; shift 2 ;;
    --no-cron) INSTALL_CRON=0; shift ;;
    --no-swap) DO_SWAP=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1"; usage; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "请用 root 执行：sudo bash deploy/harden_runtime.sh"
  exit 1
fi

echo "==> 宿主内存"
free -h || true

if [[ "$DO_SWAP" -eq 1 ]]; then
  echo "==> Swap ${SWAP_GB}G → ${SWAPFILE}"
  if swapon --show | grep -q "${SWAPFILE}"; then
    echo "已启用 ${SWAPFILE}，跳过创建"
  elif [[ -f "${SWAPFILE}" ]]; then
    chmod 600 "${SWAPFILE}"
    swapon "${SWAPFILE}" || true
  else
    # 优先 fallocate；部分文件系统不支持则 dd
    if ! fallocate -l "${SWAP_GB}G" "${SWAPFILE}" 2>/dev/null; then
      dd if=/dev/zero of="${SWAPFILE}" bs=1M count=$((SWAP_GB * 1024)) status=progress
    fi
    chmod 600 "${SWAPFILE}"
    mkswap "${SWAPFILE}"
    swapon "${SWAPFILE}"
  fi
  if ! grep -q "${SWAPFILE}" /etc/fstab 2>/dev/null; then
    echo "${SWAPFILE} none swap sw 0 0" >> /etc/fstab
  fi
  # 略偏保守：内存紧时早用一点 swap，降低直接 OOM 杀 Web 的概率
  sysctl -w vm.swappiness=30 >/dev/null
  if ! grep -q '^vm.swappiness' /etc/sysctl.conf 2>/dev/null; then
    echo 'vm.swappiness=30' >> /etc/sysctl.conf
  fi
  swapon --show || true
  free -h || true
fi

chmod +x "${WATCHDOG}" "${APP_ROOT}/deploy/harden_runtime.sh"

if [[ "$INSTALL_CRON" -eq 1 ]]; then
  echo "==> 安装 Web 探活 cron（每分钟，带冷却）"
  # 去掉旧条目再写入，保证幂等
  existing="$(crontab -l 2>/dev/null || true)"
  filtered="$(printf '%s\n' "${existing}" | grep -v "${CRON_TAG}" || true)"
  {
    printf '%s\n' "${filtered}"
    echo "* * * * * ${WATCHDOG} ${CRON_TAG}"
  } | grep -v '^$' | crontab -
  crontab -l | grep "${CRON_TAG}" || true
fi

echo "==> 完成。请再执行："
echo "    cd ${APP_ROOT} && docker compose -f docker-compose.prod.yml --env-file .env.production up -d"
echo "    （使 compose 内 mem_limit / NODE_OPTIONS / oom_score_adj 生效）"
