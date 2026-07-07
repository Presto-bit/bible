/** PWA Tab 保活：五个主 Tab 常驻内存，离线切换无需再拉 RSC。 */

export type KeepAliveTabId = 'home' | 'reader' | 'assistant' | 'discover' | 'profile';

const KEEP_ALIVE_PATHS: Record<KeepAliveTabId, string> = {
  home: '/',
  reader: '/reader',
  assistant: '/assistant',
  discover: '/discover',
  profile: '/profile',
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
  if (p === '/' || p === '') return 'home';
  for (const [id, href] of Object.entries(KEEP_ALIVE_PATHS) as [KeepAliveTabId, string][]) {
    if (id === 'home') continue;
    if (p === href || p.startsWith(`${href}/`)) return id;
  }
  return null;
}

export function isMainTabPath(pathname: string): boolean {
  return keepAliveTabId(pathname) !== null;
}

export function isKeepAliveTabHref(href: string): boolean {
  return keepAliveTabId(href) !== null;
}
