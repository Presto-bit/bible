/** 打卡墙已读状态（本地优先）。 */

import { localDayKey } from './group_ui';

function storageKey(groupId: string, dayKey: string) {
  return `group_wall_read:${groupId}:${dayKey}`;
}

export function loadWallReadIds(groupId: string, dayKey = localDayKey(new Date())): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey(groupId, dayKey));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function markWallRead(groupId: string, messageId: string, dayKey = localDayKey(new Date())) {
  const set = loadWallReadIds(groupId, dayKey);
  set.add(messageId);
  localStorage.setItem(storageKey(groupId, dayKey), JSON.stringify([...set]));
}

export function isWallUnread(
  groupId: string,
  messageId: string,
  mine: boolean,
  dayKey = localDayKey(new Date()),
): boolean {
  if (mine) return false;
  return !loadWallReadIds(groupId, dayKey).has(messageId);
}
