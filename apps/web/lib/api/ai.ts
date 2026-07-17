/** AI 相关 API（E7 拆分）——避免与 api.ts 循环依赖 */
import { getDeviceId, stableDeviceFingerprint } from '../device_id';
import { deviceIdToUserCode, isUserCode } from '../user_code';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'https://2sc.prestoai.cn';

const SESSION_KEY = 'presto_session_token';

function aiAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof window === 'undefined') return h;
  const device = getDeviceId();
  if (device) {
    h['X-Guest-Id'] = device;
    h['X-Device-Id'] = device;
  }
  const fp = stableDeviceFingerprint();
  if (fp) h['X-Device-Fingerprint'] = fp;
  const tok = localStorage.getItem(SESSION_KEY);
  if (tok) h.Authorization = `Bearer ${tok}`;
  let code =
    localStorage.getItem('presto_user_id') || localStorage.getItem('presto_guest_id') || '';
  if (!isUserCode(code) && device && !device.startsWith('dev-')) {
    const derived = deviceIdToUserCode(device);
    if (isUserCode(derived)) code = derived;
  }
  if (isUserCode(code)) {
    h['X-User-Code'] = code;
    h['X-User-Id'] = code;
  }
  return h;
}

export interface AiQuota {
  used: number;
  limit: number;
  unlimited: boolean;
}

export async function fetchAiQuota(): Promise<AiQuota | null> {
  try {
    const res = await fetch(`${API_BASE}/ai/quota`, {
      headers: aiAuthHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as AiQuota;
  } catch {
    return null;
  }
}
