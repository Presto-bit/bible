/** 消息聚合推送：服务端发消息后 debounce 合并投递；壳内进程存活时走本地通知桥 */

import { api } from './api';
import {
  getNotifPrefs,
  isBibleReadingPath,
  isReadingDndEnabled,
  setNotifPrefs,
} from './notif_prefs';
import { isPeiaiAndroidShell } from './pwa_platform';
import { isDiscoverImSessionPath } from './im_session_gate';
import { normalizeAppPath } from './tab_keep_alive';

export interface PushDigest {
  title: string;
  body: string;
  href: string;
  unread?: number;
}

let shellDigestStop: (() => void) | null = null;
let shellDigestTimer: number | null = null;
let lastShellDigestKey = '';

export async function fetchPushDigest(): Promise<PushDigest | null> {
  try {
    return await api.pushDigest();
  } catch {
    return null;
  }
}

function digestOpenPath(href: string): string {
  try {
    if (href.startsWith('http')) {
      const u = new URL(href);
      return `${u.pathname}${u.search}` || '/discover';
    }
  } catch {
    /* ignore */
  }
  return href.startsWith('/') ? href : '/discover';
}

/** 已在目标会话页时不弹（避免自己打扰自己） */
function isViewingDigestTarget(href: string): boolean {
  if (typeof window === 'undefined') return false;
  const target = normalizeAppPath(digestOpenPath(href).split('?')[0] || '/discover');
  const cur = normalizeAppPath(window.location.pathname);
  if (target === cur) return true;
  // 在消息列表且摘要只指向 /discover
  if (target === '/discover' && cur === '/discover') return true;
  return false;
}

/** 前台 / 壳本地 Notification（读经勿扰时在圣经页不弹） */
export async function notifyDigestIfAllowed(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isGroupDigestEnabled()) return false;
  if (isReadingDndEnabled() && isBibleReadingPath()) return false;

  const digest = await fetchPushDigest();
  if (!digest?.body || digest.body === '近期没有需要处理的消息') return false;
  if ((digest.unread ?? 0) <= 0) return false;
  const href = digest.href || '/discover';
  if (isViewingDigestTarget(href)) return false;

  const openPath = digestOpenPath(href);
  const tag = openPath.startsWith('/discover/dm/')
    ? `presto-dm-${openPath}`
    : openPath.startsWith('/discover/group/')
      ? `presto-group-${openPath}`
      : 'presto-digest';

  // 仅旧 WebView 壳走原生社交摘要；Chrome Host / iOS 走 Web Notification / Web Push
  if (isPeiaiAndroidShell()) {
    try {
      const {
        showAndroidShellNotification,
        requestAndroidShellNotifications,
        hasAndroidShellNotification,
      } = await import('./android_shell_bridge');
      if (hasAndroidShellNotification()) {
        requestAndroidShellNotifications();
        const key = `${tag}|${digest.body}|${digest.unread ?? 0}`;
        if (key === lastShellDigestKey) return false;
        const ok = showAndroidShellNotification({
          title: digest.title || '彼爱',
          body: digest.body,
          openPath,
          tag,
        });
        if (ok) lastShellDigestKey = key;
        return ok;
      }
    } catch {
      /* fall through to Web Notification */
    }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const n = new Notification(digest.title, {
    body: digest.body,
    tag: 'presto-digest',
    data: { href },
  });
  n.onclick = () => {
    try {
      window.focus();
      const path = href.startsWith('http') ? new URL(href).pathname : href;
      window.location.assign(path);
    } catch {
      window.location.assign('/discover');
    }
  };
  return true;
}

export function isGroupDigestEnabled(): boolean {
  return getNotifPrefs().socialDigest;
}

export function isStreakRecallEnabled(): boolean {
  return getNotifPrefs().streakRecall;
}

export function setGroupDigestEnabled(enabled: boolean) {
  setNotifPrefs({ socialDigest: enabled });
}

/** @deprecated 近实时改由服务端 debounce；保留空实现以免旧调用报错 */
export function markDigestSent() {}

export function canSendDigestToday(): boolean {
  return true;
}

function scheduleShellDigestNotify(delayMs = 400) {
  if (shellDigestTimer != null) window.clearTimeout(shellDigestTimer);
  shellDigestTimer = window.setTimeout(() => {
    shellDigestTimer = null;
    // 前台正聊着可不弹；后台 / 其它页则弹
    if (
      document.visibilityState === 'visible'
      && isDiscoverImSessionPath()
    ) {
      return;
    }
    void notifyDigestIfAllowed();
  }, delayMs);
}

/**
 * 壳内：无 Web Push，用 SSE/cursor 变化 + 回前台触发本地摘要通知。
 * PWA 仍靠服务端 Web Push，保持空操作。
 */
export function startDigestPoller() {
  if (typeof window === 'undefined') return;
  if (!isPeiaiAndroidShell()) return;
  if (shellDigestStop) return;

  let unsubRealtime: (() => void) | null = null;
  let cancelled = false;

  void import('./social_realtime').then(({ subscribeSocialRealtime }) => {
    if (cancelled) return;
    unsubRealtime = subscribeSocialRealtime(
      (_c, changed) => {
        if (changed) scheduleShellDigestNotify(500);
      },
      { watch: 'all', debounceMs: 400 },
    );
  });

  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      // 刚切后台：稍等再拉，合并刚到的消息
      scheduleShellDigestNotify(800);
    }
  };
  const onResume = () => {
    // 回前台清「同摘要去重」，便于下次后台再弹
    lastShellDigestKey = '';
  };

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('peiai-shell-resume', onResume);

  shellDigestStop = () => {
    cancelled = true;
    unsubRealtime?.();
    if (shellDigestTimer != null) window.clearTimeout(shellDigestTimer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('peiai-shell-resume', onResume);
    shellDigestStop = null;
  };
}
