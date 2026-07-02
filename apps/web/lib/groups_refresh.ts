import { useEffect } from 'react';
import type { Group } from './api';
import { groupInactiveMs } from './group_policy';

const DIRTY_KEY = 'presto_groups_dirty';
const PENDING_GROUPS_KEY = 'presto_pending_groups';

export type PendingGroup = Pick<Group, 'id' | 'name' | 'join_code' | 'role'>;

type PendingRow = PendingGroup & { ts: number };

function readPendingRows(): PendingRow[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_GROUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row) => row?.id);
  } catch {
    return [];
  }
}

function writePendingRows(rows: PendingRow[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_GROUPS_KEY, JSON.stringify(rows));
}

/** 群列表有变更（建群/加群/解散），返回发现页时需重新拉取。 */
export function markGroupsListDirty() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DIRTY_KEY, '1');
  window.dispatchEvent(new Event('groups:list-dirty'));
}

export function clearGroupsListDirty() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DIRTY_KEY);
}

/** 建群/加群后立即写入 localStorage；服务端未确认的条目超过 30 天无动态规则后自动清理。 */
export function stashCreatedGroup(g: PendingGroup) {
  if (typeof window === 'undefined') return;
  const rows = readPendingRows().filter((row) => row.id !== g.id);
  rows.unshift({ ...g, ts: Date.now() });
  writePendingRows(rows);
  markGroupsListDirty();
}

/** 用户从列表移除乐观缓存的群（如建群失败后的残留条目）。 */
export function dismissPendingGroup(id: string) {
  if (typeof window === 'undefined') return;
  const rows = readPendingRows().filter((row) => row.id !== id);
  writePendingRows(rows);
  markGroupsListDirty();
}

/** 静默清理超过 30 天且服务端仍未确认的乐观群（与服务端幽灵群策略一致）。 */
export function pruneStalePendingGroups(confirmedIds: string[]) {
  if (typeof window === 'undefined') return;
  const confirmed = new Set(confirmedIds);
  const cutoff = Date.now() - groupInactiveMs();
  const rows = readPendingRows().filter((row) => {
    if (confirmed.has(row.id)) return true;
    return (row.ts || 0) > cutoff;
  });
  if (rows.length !== readPendingRows().length) {
    writePendingRows(rows);
    markGroupsListDirty();
  }
}

/** 尚未被 API 确认的乐观群 id，用于列表展示「移除」入口。 */
export function getPendingOnlyIds(confirmedIds: string[]): string[] {
  const confirmed = new Set(confirmedIds);
  return readPendingRows().filter((row) => !confirmed.has(row.id)).map((row) => row.id);
}

export function mergePendingGroups(groups: Group[]): Group[] {
  if (typeof window === 'undefined') return groups;
  const confirmedIds = groups.map((g) => g.id);
  pruneStalePendingGroups(confirmedIds);
  const pending = readPendingRows();
  if (!pending.length) return groups;

  const merged = [...groups];
  for (const row of pending) {
    if (merged.some((item) => item.id === row.id)) continue;
    merged.unshift({
      id: row.id,
      name: row.name,
      join_code: row.join_code,
      role: row.role || 'owner',
      members: 1,
      checked_in_today: 0,
      my_checked_in_today: false,
      open_tasks: 0,
    });
  }

  return merged;
}

function isGroupsListDirty(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DIRTY_KEY) === '1';
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
    const onPageShow = () => run();
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
