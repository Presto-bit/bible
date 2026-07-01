// H5 每日读经提醒（与 App 本地通知对齐的轻量版）。
// 浏览器无后台推送时，使用 Notification API 在页面打开期间到点提醒；
// 设置（开关 + 时间）持久化到 localStorage，登录后未来可接 Web Push。

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

// 在页面打开期间调度下一次提醒；触发后自动续约到次日同一时间。
export function reschedule() {
  if (typeof window === 'undefined') return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = getReminder();
  if (!p.enabled || !('Notification' in window)) return;
  timer = setTimeout(() => {
    if (Notification.permission === 'granted') {
      new Notification('今日读经', {
        body: '愿话语成为你脚前的灯，点开继续今天的阅读。',
      });
    }
    reschedule();
  }, msUntil(p.hour, p.minute));
}
