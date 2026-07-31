/** 账号恢复信息导出（截图 / 复制） */

import { effectiveId, getUserName } from './api';

export function buildAccountRecoveryText(phone?: string | null): string {
  const id = effectiveId();
  const name = getUserName().trim();
  const lines = ['彼爱 · 账号恢复信息', ''];
  if (name) lines.push(`称呼：${name}`);
  if (phone) lines.push(`手机号：${phone}`);
  if (id) lines.push(`用户 ID：${id}`);
  lines.push('', '换机时在「恢复账号」输入手机号或用户 ID + 密码（也支持历史用户名）。');
  return lines.join('\n');
}

export function recoveryLoginUrl(): string {
  const name = getUserName().trim();
  const id = effectiveId();
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://2sc.prestoai.cn';
  const q = name ? `u=${encodeURIComponent(name)}` : id ? `id=${encodeURIComponent(id)}` : '';
  return q ? `${base}/login?${q}` : `${base}/login`;
}
