/** PWA Tab 保活：五个主 Tab 常驻内存，离线切换无需再拉 RSC。 */

export type KeepAliveTabId = 'home' | 'reader' | 'assistant' | 'discover' | 'profile';

const KEEP_ALIVE_PATHS: Record<KeepAliveTabId, string> = {
  home: '/',
  reader: '/reader',
  assistant: '/assistant',
  discover: '/discover',
  profile: '/profile',
};

/** 我的 Tab 下的二级页，不走 Tab 保活（须走 Next 路由）。 */
export const PROFILE_SECONDARY_PATHS = [
  '/profile/reminders',
  '/profile/appearance',
  '/profile/licenses',
] as const;

/** 发现 Tab 下的二级页（群详情、私信、邀请、好友等），须走 Next 路由。 */
export const DISCOVER_SECONDARY_PREFIXES = [
  '/discover/groups',
  '/discover/join',
  '/discover/contacts',
  '/discover/friends',
  '/discover/group/',
  '/discover/dm/',
  '/discover/invites',
] as const;

function isProfileSecondaryPath(pathname: string): boolean {
  return PROFILE_SECONDARY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isDiscoverSecondaryPath(pathname: string): boolean {
  return DISCOVER_SECONDARY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

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
    if (p === href) return id;
    if (p.startsWith(`${href}/`)) {
      if (id === 'profile' && isProfileSecondaryPath(p)) continue;
      if (id === 'discover' && isDiscoverSecondaryPath(p)) continue;
      return id;
    }
  }
  return null;
}

export function isMainTabPath(pathname: string): boolean {
  return keepAliveTabId(pathname) !== null;
}

export function isKeepAliveTabHref(href: string): boolean {
  return keepAliveTabId(href) !== null;
}
