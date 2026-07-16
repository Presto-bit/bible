/** Web Push / 通知权限与 VAPID 就绪检测（U8） */

import { fetchVapidPublicKey } from './web_push';

export type PushReadiness =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no_vapid' | 'no_sw' };

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function checkPushReadiness(): Promise<PushReadiness> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
  const pub = await fetchVapidPublicKey();
  if (!pub) return { ok: false, reason: 'no_vapid' };
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg?.pushManager) return { ok: false, reason: 'no_sw' };
  } catch {
    return { ok: false, reason: 'no_sw' };
  }
  return { ok: true };
}

export function pushReadinessHint(r: PushReadiness): string {
  if (r.ok) return '';
  switch (r.reason) {
    case 'unsupported':
      return '当前浏览器不支持推送通知，请使用 Chrome / Safari 并安装到主屏幕。';
    case 'denied':
      return '通知权限已被拒绝，请在系统或浏览器设置中允许「彼爱」发送通知。';
    case 'no_vapid':
      return '服务端尚未配置 Web Push（VAPID），提醒仅在本页打开时生效。';
    case 'no_sw':
      return 'Service Worker 未就绪，请刷新页面后重试。';
    default:
      return '推送暂不可用';
  }
}
