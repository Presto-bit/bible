import { api } from './api';
import { userLsGet, userLsSet, userLsRemove } from './user_storage';

export type QueuedCheckin = {
  id: string;
  gid: string;
  body?: string;
  ref?: string;
  task_id?: string;
  created_at: string;
};

const KEY = 'group_checkin_queue';

export const CHECKIN_QUEUED_EVENT = 'presto-checkin-queued';
export const CHECKIN_FLUSHED_EVENT = 'presto-checkin-flushed';

function read(): QueuedCheckin[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(userLsGet(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(items: QueuedCheckin[]) {
  userLsSet(KEY, JSON.stringify(items));
}

export function queueCheckin(
  gid: string,
  payload: { body?: string; ref?: string; task_id?: string },
): QueuedCheckin {
  const item: QueuedCheckin = {
    id: `q-${Date.now()}`,
    gid,
    ...payload,
    created_at: new Date().toISOString(),
  };
  write([...read(), item]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHECKIN_QUEUED_EVENT, { detail: { gid } }));
  }
  return item;
}

export function pendingCheckins(gid?: string): QueuedCheckin[] {
  const all = read();
  return gid ? all.filter((q) => q.gid === gid) : all;
}

/** 联网后补发离线打卡队列 */
export async function flushCheckinQueue(): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  const items = read();
  if (!items.length) return 0;
  const remain: QueuedCheckin[] = [];
  let sent = 0;
  for (const q of items) {
    try {
      await api.checkin(q.gid, { body: q.body, ref: q.ref, task_id: q.task_id });
      sent += 1;
    } catch {
      remain.push(q);
    }
  }
  write(remain);
  if (sent > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHECKIN_FLUSHED_EVENT, { detail: { sent } }));
  }
  return sent;
}
