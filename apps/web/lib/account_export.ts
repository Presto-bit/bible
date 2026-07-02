/** 账号恢复信息导出（截图 / 复制） */

import { effectiveId, getUserName } from './api';

export function buildAccountRecoveryText(phone?: string | null): string {
  const id = effectiveId();
  const name = getUserName().trim();
  const lines = ['彼爱 · 账号恢复信息', ''];
  if (name) lines.push(`用户名：${name}`);
  if (phone) lines.push(`手机号：${phone}`);
  if (id) lines.push(`用户 ID：${id}`);
  lines.push('', '换机时在「恢复账号」输入用户名+密码，或手机号+密码。');
  return lines.join('\n');
}

export function recoveryLoginUrl(): string {
  const name = getUserName().trim();
  const id = effectiveId();
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://2sc.prestoai.cn';
  const q = name ? `u=${encodeURIComponent(name)}` : id ? `id=${encodeURIComponent(id)}` : '';
  return q ? `${base}/login?${q}` : `${base}/login`;
}
