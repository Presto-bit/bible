/** 发现壳：同路人 | 探索 分段状态 */

export type DiscoverPaneId = 'peers' | 'explore';

const SESSION_KEY = 'beiai_discover_pane_v1';

export function parseDiscoverPane(raw: string | null | undefined): DiscoverPaneId | null {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'explore' || v === '知识' || v === '探索') return 'explore';
  if (v === 'peers' || v === 'tongluren' || v === '同路人' || v === 'messages') {
    return 'peers';
  }
  return null;
}

export function readDiscoverPaneSession(): DiscoverPaneId | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseDiscoverPane(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function writeDiscoverPaneSession(pane: DiscoverPaneId): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, pane);
  } catch {
    /* private mode */
  }
}

/** 无 URL/会话意图时：有好友 → 同路人，否则探索 */
export function defaultDiscoverPane(friendCount: number): DiscoverPaneId {
  return friendCount >= 1 ? 'peers' : 'explore';
}
