/** PWA Tab 保活：仅圣经 / 小爱两页常驻内存（对齐 Mobile IndexedStack）。 */

export type KeepAliveTabId = 'reader' | 'assistant';

const KEEP_ALIVE_PATHS: Record<KeepAliveTabId, string> = {
  reader: '/reader',
  assistant: '/assistant',
};

export function normalizeAppPath(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  if (base && pathname.startsWith(base)) {
    return pathname.slice(base.length) || '/';
  }
  return pathname;
}

export function keepAliveTabId(pathname: string): KeepAliveTabId | null {
  const p = normalizeAppPath(pathname);
  for (const [id, href] of Object.entries(KEEP_ALIVE_PATHS) as [KeepAliveTabId, string][]) {
    if (p === href || p.startsWith(`${href}/`)) return id;
  }
  return null;
}

export function isKeepAliveTabHref(href: string): boolean {
  return keepAliveTabId(href) !== null;
}
