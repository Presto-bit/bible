/** 发现页内未读同步（会话列表 / 通讯录 / 底栏角标，由 client-defaults 开关）。 */

/** 底栏「发现」数字：0 不展示；1–99 原样；≥100 为 99+ */
export function formatDiscoverTabBadge(count: number): string | null {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return null;
  if (n >= 100) return '99+';
  return String(n);
}

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
