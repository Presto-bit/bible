import { getReminder } from './reminder';

const GROUP_KEY = 'presto_group_evening_reminder';
const REACT_PUSH_KEY = 'presto_react_push_disabled';

export type GroupEveningReminder = {
  enabled: boolean;
  hour: number;
  minute: number;
};

const GROUP_DEFAULT: GroupEveningReminder = { enabled: false, hour: 20, minute: 30 };

export function getGroupEveningReminder(): GroupEveningReminder {
  if (typeof window === 'undefined') return GROUP_DEFAULT;
  try {
    const raw = JSON.parse(localStorage.getItem(GROUP_KEY) || 'null');
    return raw ? { ...GROUP_DEFAULT, ...raw } : GROUP_DEFAULT;
  } catch {
    return GROUP_DEFAULT;
  }
}

export function setGroupEveningReminder(p: GroupEveningReminder) {
  localStorage.setItem(GROUP_KEY, JSON.stringify(p));
  rescheduleGroupEveningReminder();
}

let groupTimer: ReturnType<typeof setTimeout> | null = null;

function msUntil(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function fireGroupEveningReminder() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const pref = getGroupEveningReminder();
  if (!pref.enabled) return;
  try {
    const { api } = await import('./api');
    const { groups } = await api.myGroups();
    const pending = groups.filter((g) => !g.my_checked_in_today);
    if (pending.length === 0) return;
    const name = pending[0].name;
    const extra = pending.length > 1 ? `等 ${pending.length} 个群` : '';
    new Notification('群打卡提醒', {
      body: `「${name}」${extra}还在等你打卡，轻轻完成今天就好。`,
      tag: 'presto-group-evening',
    });
  } catch {
    // ignore
  }
}

export function rescheduleGroupEveningReminder() {
  if (typeof window === 'undefined') return;
  if (groupTimer) {
    clearTimeout(groupTimer);
    groupTimer = null;
  }
  const p = getGroupEveningReminder();
  if (!p.enabled || !('Notification' in window)) return;
  groupTimer = setTimeout(() => {
    void fireGroupEveningReminder();
    rescheduleGroupEveningReminder();
  }, msUntil(p.hour, p.minute));
}

/** 回应/点赞不推送（仅 App 内未读） */
export function isReactPushDisabled(): boolean {
  if (typeof window === 'undefined') return true;
  const v = localStorage.getItem(REACT_PUSH_KEY);
  return v !== '0';
}

export function setReactPushDisabled(disabled: boolean) {
  localStorage.setItem(REACT_PUSH_KEY, disabled ? '1' : '0');
}

export function reminderPolicySummary(): string {
  const daily = getReminder();
  const group = getGroupEveningReminder();
  const parts: string[] = [];
  parts.push(daily.enabled ? `每日读经 ${daily.hour}:${String(daily.minute).padStart(2, '0')}` : '每日读经：未开启');
  parts.push(group.enabled ? `群打卡 ${group.hour}:${String(group.minute).padStart(2, '0')}（仅未打卡时）` : '群打卡提醒：未开启');
  parts.push('回应与点赞：不推送');
  return parts.join(' · ');
}
