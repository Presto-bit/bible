// H5 每日读经提醒：主路径为服务端 Web Push（/push/cron/tick + 订阅时段）；
// 下方 setTimeout 仅作「页面仍打开」时的前台兜底。

import { fetchPushDigest, isStreakRecallEnabled } from './push_digest';
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

export function setReminder(p: ReminderPref, opts?: { source?: string }) {
  const prev = getReminder();
  localStorage.setItem(KEY, JSON.stringify(p));
  reschedule();
  void import('./notifications').then((m) => m.syncPushSubscription().catch(() => {}));
  if (p.enabled && !prev.enabled) {
    void import('./product_events').then((m) =>
      m.trackProductEvent('reminder_enable', {
        props: {
          hour: p.hour,
          minute: p.minute,
          ...(opts?.source ? { source: opts.source } : {}),
        },
        oncePerDay: true,
      }),
    );
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  // 安卓壳：先申请系统 POST_NOTIFICATIONS（Android 13+），再走浏览器 Notification
  try {
    const { requestAndroidShellNotifications } = await import('./android_shell_bridge');
    requestAndroidShellNotifications();
  } catch {
    /* ignore */
  }
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
    void import('./web_push').then((m) => m.deliverPushDigest());
    return;
  }
  const streak = readingStreak();
  const body =
    isStreakRecallEnabled() && streak === 0
      ? '今天只需一节经文，从打开彼爱开始就好。'
      : '愿话语成为你脚前的灯，点开继续今天的阅读。';
  new Notification('彼爱 · 今日读经', { body });
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
