import { localDayKey } from './group_ui';
import { userLsGet, userLsSet } from './user_storage';

const KEY = 'group_gentle_nudge';

type Record = { day: string; gid: string };

function read(): Record | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(userLsGet(KEY) || 'null') as Record | null;
  } catch {
    return null;
  }
}

/** 群主今日是否已对该群发过轻轻提醒 */
export function canGentleNudgeToday(gid: string): boolean {
  const r = read();
  const day = localDayKey(new Date());
  return !(r && r.day === day && r.gid === gid);
}

export function markGentleNudgeSent(gid: string) {
  userLsSet(KEY, JSON.stringify({ day: localDayKey(new Date()), gid }));
}
