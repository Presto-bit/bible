/** Web Push / 通知权限与 VAPID 就绪检测（U8） */

import { isPeiaiAndroidShell } from './pwa_platform';
import { fetchVapidPublicKey } from './web_push';

export type PushReadiness =
  | { ok: true; path?: 'web_push' | 'android_shell_alarm' }
  | {
      ok: false;
      reason: 'unsupported' | 'denied' | 'no_vapid' | 'no_sw' | 'shell_need_permission';
    };

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function checkPushReadiness(): Promise<PushReadiness> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };

  // 安卓独立壳：本地 AlarmManager 为准点主路径，不依赖 Web Push / SW
  if (isPeiaiAndroidShell()) {
    try {
      const { requestAndroidShellNotifications } = await import('./android_shell_bridge');
      requestAndroidShellNotifications();
    } catch {
      /* ignore */
    }
    if ('Notification' in window && Notification.permission === 'denied') {
      return { ok: false, reason: 'denied' };
    }
    return { ok: true, path: 'android_shell_alarm' };
  }

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
  return { ok: true, path: 'web_push' };
}

export function pushReadinessHint(r: PushReadiness): string {
  if (r.ok) {
    if (r.path === 'android_shell_alarm' && isPeiaiAndroidShell()) {
      return '已通过 App 本地闹钟准时提醒，即使完全退出后也能收到。';
    }
    return '';
  }
  if (isPeiaiAndroidShell()) {
    switch (r.reason) {
      case 'denied':
        return '通知权限已被关闭。请在系统设置 → 彼爱 → 通知中允许，才能准时提醒。';
      case 'unsupported':
        return '当前安装包暂不支持系统通知，请升级到最新安装包。';
      default:
        return '提醒可能不完整。请允许通知权限，或升级到最新安装包。';
    }
  }
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
