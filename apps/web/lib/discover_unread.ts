/** 发现页内未读同步（会话列表 / 通讯录角标）。底栏发现永不显示未读角标。 */

export const DISCOVER_UNREAD_CHANGED = 'presto-discover-unread-changed';

export type DiscoverUnreadDetail = {
  /** 乐观增减（如打开会话清掉该会话未读） */
  delta?: number;
};

export function notifyDiscoverUnreadChanged(detail?: DiscoverUnreadDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(DISCOVER_UNREAD_CHANGED, { detail: detail ?? {} }),
  );
}

export function subscribeDiscoverUnreadChanged(
  fn: (detail: DiscoverUnreadDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<DiscoverUnreadDetail>).detail || {};
    fn(detail);
  };
  window.addEventListener(DISCOVER_UNREAD_CHANGED, handler);
  return () => window.removeEventListener(DISCOVER_UNREAD_CHANGED, handler);
}
