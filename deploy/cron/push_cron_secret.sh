#!/usr/bin/env bash
# 从环境或 .env.production 读取 PUSH_CRON_SECRET，并拒绝文档占位符。
# 用法：source 后调用 bible_resolve_push_cron_secret [ENV_FILE]
set -euo pipefail

bible_push_cron_secret_invalid_reason() {
  local val="${1:-}"
  if [[ -z "$val" ]]; then
    echo "未配置"
    return 0
  fi
  if [[ "$val" == *'与 .env.production 相同'* ]] \
    || [[ "$val" == *'与 .env 相同'* ]] \
    || [[ "$val" == '与生产一致的密钥' ]] \
    || [[ "$val" == *'请填写'* ]] \
    || [[ "$val" == *'your-'* ]] \
    || [[ "$val" == *'changeme'* ]]; then
    echo "似为文档占位符"
    return 0
  fi
  if [[ ${#val} -lt 16 ]]; then
    echo "过短（建议 openssl rand -hex 32，≥16 字符）"
    return 0
  fi
  return 1
}

# 成功时 stdout 输出密钥；失败时 stderr 说明并 exit 1
bible_resolve_push_cron_secret() {
  local env_file="${1:-}"
  local val="${PUSH_CRON_SECRET:-}"

  if [[ -z "$val" && -n "$env_file" && -f "$env_file" ]]; then
    val="$(grep -E '^PUSH_CRON_SECRET=' "$env_file" | tail -1 | cut -d= -f2- | tr -d ' \"\047' || true)"
  fi

  local reason
  if reason="$(bible_push_cron_secret_invalid_reason "$val")"; then
    echo "PUSH_CRON_SECRET $reason（请在 .env.production 配置随机密钥）" >&2
    return 1
  fi
  printf '%s' "$val"
}
