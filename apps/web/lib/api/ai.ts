/** AI 相关 API（E7 拆分） */
import { getDeviceId } from '../device_id';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn';

function quotaUserCode(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('presto_user_id') || localStorage.getItem('presto_guest_id') || '';
}

export interface AiQuota {
  used: number;
  limit: number;
  unlimited: boolean;
}

export async function fetchAiQuota(): Promise<AiQuota | null> {
  const headers: Record<string, string> = {
    'X-Guest-Id': getDeviceId(),
    'X-Device-Id': getDeviceId(),
  };
  const code = quotaUserCode();
  if (code) {
    headers['X-User-Code'] = code;
    headers['X-User-Id'] = code;
  }
  try {
    const res = await fetch(`${API_BASE}/ai/quota`, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as AiQuota;
  } catch {
    return null;
  }
}
