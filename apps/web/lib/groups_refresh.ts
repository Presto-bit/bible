import { useEffect } from 'react';

const DIRTY_KEY = 'presto_groups_dirty';

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

function isGroupsListDirty(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(DIRTY_KEY) === '1';
}

/** 路由重新进入或列表脏标记时刷新群列表。 */
export function useGroupsListRefresh(reload: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => reload();
    if (isGroupsListDirty()) run();
    const onDirty = () => run();
    const onVis = () => {
      if (document.visibilityState === 'visible' && isGroupsListDirty()) run();
    };
    window.addEventListener('groups:list-dirty', onDirty);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('groups:list-dirty', onDirty);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reload, enabled]);
}
