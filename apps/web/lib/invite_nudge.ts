/** 读完 / 打卡后的「邀请朋友」轻触达（每日最多一次） */

export const INVITE_NUDGE_EVENT = 'presto-invite-nudge';
export const INVITE_NUDGE_DAY_KEY = 'invite-nudge-shown-day';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function canShowInviteNudge(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(INVITE_NUDGE_DAY_KEY) !== todayKey();
}

export function markInviteNudgeShown(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(INVITE_NUDGE_DAY_KEY, todayKey());
}

/** 成功瞬间之后再出，避免抢打卡/读完主反馈 */
export function requestInviteNudge(delayMs = 1600): void {
  if (typeof window === 'undefined') return;
  if (!canShowInviteNudge()) return;
  window.setTimeout(() => {
    if (!canShowInviteNudge()) return;
    window.dispatchEvent(new Event(INVITE_NUDGE_EVENT));
  }, delayMs);
}
