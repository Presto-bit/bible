// H5 每日读经提醒 + F1 聚合摘要（前台 Notification，每日 ≤2 条）。

import { fetchPushDigest, isStreakRecallEnabled, markDigestSent } from './push_digest';
import { readingStreak } from './gamification';

export interface ReminderPref {
  enabled: boolean;
  hour: number;
  minute: number;
}

const KEY = 'presto_reminder';
const DEFAULT: ReminderPref = { enabled: false, hour: 8, minute: 0 };

let timer: ReturnType<typeof setTimeout> | null = null;

export function getReminder(): ReminderPref {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw ? { ...DEFAULT, ...raw } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setReminder(p: ReminderPref) {
  localStorage.setItem(KEY, JSON.stringify(p));
  reschedule();
  void import('./web_push').then((m) => m.subscribeWebPush().catch(() => {}));
}

export async function ensurePermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const res = await Notification.requestPermission();
  return res === 'granted';
}

function msUntil(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function fireReminder() {
  if (Notification.permission !== 'granted') return;
  const digest = await fetchPushDigest();
  if (digest?.body) {
    new Notification(digest.title, { body: digest.body, tag: 'presto-digest' });
    markDigestSent();
    void import('./web_push').then((m) => m.deliverPushDigest());
    return;
  }
  const streak = readingStreak();
  const body =
    isStreakRecallEnabled() && streak === 0
      ? '今天只需 5 分钟，从一节经文开始就好。'
      : '愿话语成为你脚前的灯，点开继续今天的阅读。';
  new Notification('今日读经', { body });
}

export function reschedule() {
  if (typeof window === 'undefined') return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = getReminder();
  if (!p.enabled || !('Notification' in window)) return;
  timer = setTimeout(() => {
    void fireReminder();
    reschedule();
  }, msUntil(p.hour, p.minute));
}
