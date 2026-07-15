/** F1 聚合推送摘要（每日 ≤2 条，前台 Notification）；尊免除打扰与读经勿扰 */

import { api } from './api';
import { getNotifPrefs, isBibleReadingPath, isReadingDndEnabled, setNotifPrefs } from './notif_prefs';

const SENT_KEY = 'presto_digest_sent_v1';
const MAX_PER_DAY = 2;

interface SentLog {
  date: string;
  count: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readSent(): SentLog {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) || 'null') as SentLog | null;
    if (raw?.date === todayKey()) return raw;
  } catch { /* ignore */ }
  return { date: todayKey(), count: 0 };
}

function bumpSent() {
  const log = readSent();
  log.count += 1;
  localStorage.setItem(SENT_KEY, JSON.stringify(log));
}

export function canSendDigestToday(): boolean {
  return readSent().count < MAX_PER_DAY;
}

export function markDigestSent() {
  bumpSent();
}

export interface PushDigest {
  title: string;
  body: string;
  href: string;
}

export async function fetchPushDigest(): Promise<PushDigest | null> {
  if (!canSendDigestToday()) return null;
  try {
    const d = await api.pushDigest();
    return d;
  } catch {
    return null;
  }
}

export async function notifyDigestIfAllowed(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (!canSendDigestToday()) return false;
  if (!isGroupDigestEnabled()) return false;
  // 读经勿扰：正在圣经/阅读页时不弹社交前台通知
  if (isReadingDndEnabled() && isBibleReadingPath()) return false;
  const digest = await fetchPushDigest();
  if (!digest?.body) return false;
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
  bumpSent();
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

/** 前台轮询：页面可见时每 30 分钟最多尝试一次聚合推送。 */
let lastPoll = 0;

export function startDigestPoller() {
  if (typeof window === 'undefined') return;
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastPoll < 30 * 60 * 1000) return;
    lastPoll = now;
    if (isGroupDigestEnabled()) void notifyDigestIfAllowed();
  };
  window.setInterval(tick, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', tick);
  tick();
}
