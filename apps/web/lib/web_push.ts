/** 注册 Web Push 订阅（VAPID）并同步提醒偏好到服务端 */
import { API_BASE, authHeaders } from './api';
import { getReminder } from './reminder';
import { getNotifPrefs } from './notif_prefs';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/push/vapid-public-key`, { cache: 'no-store' });
    if (!res.ok) return null;
    const d = (await res.json()) as { public_key?: string };
    return d.public_key || null;
  } catch {
    return null;
  }
}

export async function subscribeWebPush(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const pub = await fetchVapidPublicKey();
  if (!pub) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pub),
    });
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
  const rem = getReminder();
  const prefs = getNotifPrefs();
  const res = await fetch(`${API_BASE}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      reminder: {
        enabled: rem.enabled,
        hour: rem.hour,
        minute: rem.minute,
        streak_recall: prefs.streakRecall,
        group_digest: prefs.socialDigest,
        reading_dnd: prefs.readingDnd,
      },
    }),
  });
  return res.ok;
}

export async function deliverPushDigest(): Promise<void> {
  try {
    await fetch(`${API_BASE}/push/deliver-digest`, {
      method: 'POST',
      headers: { ...authHeaders() },
    });
  } catch {
    /* ignore */
  }
}
