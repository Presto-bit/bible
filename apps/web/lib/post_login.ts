/** 登录成功后：合并游客额度 + 静默云同步 */
import { API_BASE, currentUserId, getDeviceId } from './api';
import { syncNow } from './sync';

export async function mergeGuest(): Promise<void> {
  const uid = currentUserId();
  const device = getDeviceId();
  if (!uid || !device) return;
  try {
    await fetch(`${API_BASE}/auth/merge-guest`, {
      method: 'POST',
      headers: {
        'X-User-Id': uid,
        'X-User-Code': uid,
        'X-Guest-Id': getDeviceId(),
        'X-Device-Id': getDeviceId(),
      },
    });
  } catch {
    /* 离线或后端不可用 */
  }
}

export async function afterLogin(): Promise<{ pushed: number; pulled: number } | null> {
  await mergeGuest();
  try {
    return await syncNow();
  } catch {
    return null;
  }
}
