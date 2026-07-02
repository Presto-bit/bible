import { useEffect } from 'react';
import type { Group } from './api';

const DIRTY_KEY = 'presto_groups_dirty';
const PENDING_GROUP_KEY = 'presto_pending_group';
const PENDING_TTL_MS = 10 * 60 * 1000;

export type PendingGroup = Pick<Group, 'id' | 'name' | 'join_code' | 'role'>;

/** 群列表有变更（建群/加群/解散），返回发现页时需重新拉取。 */
export function markGroupsListDirty() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(DIRTY_KEY, '1');
  window.dispatchEvent(new Event('groups:list-dirty'));
}

export function clearGroupsListDirty() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(DIRTY_KEY);
}

/** 建群/加群后立即写入，API 尚未同步时列表可乐观展示。 */
export function stashCreatedGroup(g: PendingGroup) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PENDING_GROUP_KEY, JSON.stringify({ ...g, ts: Date.now() }));
  markGroupsListDirty();
}

export function mergePendingGroups(groups: Group[]): Group[] {
  if (typeof window === 'undefined') return groups;
  const raw = sessionStorage.getItem(PENDING_GROUP_KEY);
  if (!raw) return groups;
  try {
    const pending = JSON.parse(raw) as PendingGroup & { ts?: number };
    if (pending.ts && Date.now() - pending.ts > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_GROUP_KEY);
      return groups;
    }
    if (groups.some((item) => item.id === pending.id)) {
      sessionStorage.removeItem(PENDING_GROUP_KEY);
      return groups;
    }
    const optimistic: Group = {
      id: pending.id,
      name: pending.name,
      join_code: pending.join_code,
      role: pending.role || 'owner',
      members: 1,
      checked_in_today: 0,
      my_checked_in_today: false,
      open_tasks: 0,
    };
    return [optimistic, ...groups];
  } catch {
    return groups;
  }
}

function isGroupsListDirty(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(DIRTY_KEY) === '1';
}

/** 路由重新进入、页面恢复或列表脏标记时刷新群列表。 */
export function useGroupsListRefresh(reload: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => reload();
    if (isGroupsListDirty()) run();
    const onDirty = () => run();
    const onVis = () => {
      if (document.visibilityState === 'visible' && isGroupsListDirty()) run();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted || isGroupsListDirty()) run();
    };
    const onFocus = () => {
      if (isGroupsListDirty()) run();
    };
    window.addEventListener('groups:list-dirty', onDirty);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('groups:list-dirty', onDirty);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload, enabled]);
}
