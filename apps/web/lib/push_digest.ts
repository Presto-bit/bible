/** 消息聚合推送：服务端发消息后 1 分钟合并投递；前台仅作读经兜底时复用摘要 */

import { api } from './api';
import { getNotifPrefs, isBibleReadingPath, isReadingDndEnabled, setNotifPrefs } from './notif_prefs';

export interface PushDigest {
  title: string;
  body: string;
  href: string;
  unread?: number;
}

export async function fetchPushDigest(): Promise<PushDigest | null> {
  try {
    return await api.pushDigest();
  } catch {
    return null;
  }
}

/** 前台 Notification（读经勿扰时在圣经页不弹） */
export async function notifyDigestIfAllowed(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (!isGroupDigestEnabled()) return false;
  if (isReadingDndEnabled() && isBibleReadingPath()) return false;
  const digest = await fetchPushDigest();
  if (!digest?.body || digest.body === '近期没有需要处理的消息') return false;
  if ((digest.unread ?? 0) <= 0) return false;
  const href = digest.href || '/discover';
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

export function startDigestPoller() {
  // 服务端：发消息后 1 分钟合并推送，不再前台轮询
}
