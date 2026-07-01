#!/usr/bin/env bash
#==============================================================================
# Bible App：Docker Compose 一键部署（阿里云 ECS 首次上线）
#
# 用法：
#   cd /opt/bible-app
#   sudo bash deploy.sh --yes --user ubuntu --root /opt/bible-app
#
# 非交互：复制 deploy/deploy.env.example → deploy/deploy.env 后修改
#==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DEPLOY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

APP_USER="${APP_USER:-}"
DEPLOY_ROOT="${DEPLOY_ROOT:-$DEFAULT_DEPLOY_ROOT}"
INSTALL_APT="${INSTALL_APT:-}"
GIT_PULL="${GIT_PULL:-}"
ASSUME_YES="${ASSUME_YES:-0}"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --user) APP_USER="$2"; shift 2 ;;
    --root|--deploy-root) DEPLOY_ROOT="$2"; shift 2 ;;
    --no-apt) INSTALL_APT=0; shift ;;
    --with-apt) INSTALL_APT=1; shift ;;
    --no-git-pull) GIT_PULL=0; shift ;;
    --git-pull) GIT_PULL=1; shift ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

if [[ "${EUID:-0}" -ne 0 ]]; then
  echo "请使用 root 或 sudo 运行，例如: sudo bash deploy.sh"
  exit 1
fi

prompt() {
  local text="$1"
  local def="$2"
  local val=""
  if [[ "$ASSUME_YES" == 1 ]]; then
    echo "${def}"
    return
  fi
  read -r -p "${text} [${def}]: " val
  echo "${val:-$def}"
}

if [[ -z "${SUDO_USER:-}" || "$SUDO_USER" == "root" ]]; then
  SUGGEST_USER="$(getent passwd | awk -F: '$3>=1000 && $1!="nobody" {print $1; exit}')"
else
  SUGGEST_USER="$SUDO_USER"
fi

if [[ -f "$DEPLOY_ROOT/deploy/deploy.env" ]]; then
  # shellcheck source=/dev/null
  source "$DEPLOY_ROOT/deploy/deploy.env"
fi

if [[ -z "$APP_USER" ]]; then
  APP_USER="$(prompt "运行 Docker 的 Linux 用户名" "$SUGGEST_USER")"
fi
if [[ -z "$APP_USER" || "$APP_USER" == "root" ]]; then
  echo "APP_USER 不能为 root"
  exit 1
fi
if ! id -u "$APP_USER" &>/dev/null; then
  echo "用户不存在: $APP_USER"
  exit 1
fi

if [[ "$ASSUME_YES" != 1 ]]; then
  DEPLOY_ROOT="$(prompt "项目根目录" "$DEPLOY_ROOT")"
fi

[[ -d "$DEPLOY_ROOT" ]] || { echo "目录不存在: $DEPLOY_ROOT"; exit 1; }
[[ -f "$DEPLOY_ROOT/$COMPOSE_FILE" ]] || { echo "缺少 $COMPOSE_FILE"; exit 1; }

if [[ ! -f "$DEPLOY_ROOT/$ENV_FILE" ]]; then
  if [[ -f "$DEPLOY_ROOT/.env.production.example" ]]; then
    sudo -u "$APP_USER" -H cp "$DEPLOY_ROOT/.env.production.example" "$DEPLOY_ROOT/$ENV_FILE"
    echo "已复制 .env.production.example → .env.production，请编辑后再部署。"
    exit 1
  fi
  echo "缺少 $ENV_FILE"
  exit 1
fi

if [[ -z "${INSTALL_APT:-}" ]]; then
  if [[ "$ASSUME_YES" == 1 ]]; then
    INSTALL_APT=1
  else
    yn="$(prompt "是否安装 Docker（apt: docker.io + compose 插件）? (y/n)" "y")"
    [[ "${yn,,}" == y* ]] && INSTALL_APT=1 || INSTALL_APT=0
  fi
fi

if [[ "$INSTALL_APT" == 1 ]]; then
  if [[ -r /etc/os-release ]]; then
    # shellcheck source=/dev/null
    source /etc/os-release
  fi
  if [[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl git docker.io docker-compose-plugin
  else
    echo "非 Ubuntu/Debian，请手动安装 Docker 后设 INSTALL_APT=0"
  fi
fi

command -v docker >/dev/null 2>&1 || { echo "未找到 docker"; exit 1; }

if [[ -z "${GIT_PULL:-}" ]]; then
  if [[ "$ASSUME_YES" == 1 ]]; then
    GIT_PULL=1
  else
    yn="$(prompt "若在 git 仓库中，是否 git pull? (y/n)" "y")"
    [[ "${yn,,}" == y* ]] && GIT_PULL=1 || GIT_PULL=0
  fi
fi

if [[ "$GIT_PULL" == 1 && -d "$DEPLOY_ROOT/.git" ]]; then
  sudo -u "$APP_USER" -H git -C "$DEPLOY_ROOT" pull --ff-only || echo "（警告）git pull 失败，继续用当前代码"
fi

if getent group docker >/dev/null 2>&1; then
  usermod -aG docker "$APP_USER" 2>/dev/null || true
fi

sudo -u "$APP_USER" -H bash -c "
  set -e
  cd \"$DEPLOY_ROOT\"
  export NEXT_PUBLIC_APP_VERSION=\$(git -C \"$DEPLOY_ROOT\" rev-parse --short HEAD 2>/dev/null || echo bootstrap)
  docker compose -f \"$COMPOSE_FILE\" --env-file \"$ENV_FILE\" up -d --build
"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Bible App 部署完成"
echo "  目录:   $DEPLOY_ROOT"
echo "  API:    curl -s http://127.0.0.1:8011/health"
echo "  Web:    http://127.0.0.1:3000/  →  https://2sc.prestoai.cn/"
echo "  发版:   cd $DEPLOY_ROOT && bash release.sh"
echo "  日志:   docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f --tail=200"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
