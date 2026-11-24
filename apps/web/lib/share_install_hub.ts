/** 微信逃逸后统一安装落地 /share/start */

export const SHARE_INSTALL_HUB_PATH = '/share/start';
export const SHARE_INSTALL_NEXT_PARAM = 'next';

const SHARE_INSTALL_NEXT_PREFIXES = [
  '/share/',
  '/reader',
  '/assistant',
  '/campaigns/',
] as const;

export function isShareInstallHubPath(pathname: string | null | undefined): boolean {
  const p = (pathname || '').split('?')[0] || '';
  return p === SHARE_INSTALL_HUB_PATH || p.startsWith(`${SHARE_INSTALL_HUB_PATH}/`);
}

/** 已在统一安装页（含 preview），不再重定向 */
export function isShareInstallHubLanding(pathname: string | null | undefined): boolean {
  return isShareInstallHubPath(pathname);
}

export function sanitizeShareInstallNext(raw: string | null | undefined): string | null {
  const path = (raw || '').trim();
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const base = path.split('?')[0];
  if (base === SHARE_INSTALL_HUB_PATH || base.startsWith(`${SHARE_INSTALL_HUB_PATH}/`)) {
    return null;
  }
  const ok = SHARE_INSTALL_NEXT_PREFIXES.some(
    (pre) => base === pre || base.startsWith(pre),
  );
  return ok ? path : null;
}

export function buildShareInstallHubUrl(nextPath?: string | null): string {
  const next = sanitizeShareInstallNext(nextPath);
  if (!next) return SHARE_INSTALL_HUB_PATH;
  const u = new URL(SHARE_INSTALL_HUB_PATH, 'https://local.invalid');
  u.searchParams.set(SHARE_INSTALL_NEXT_PARAM, next);
  return `${u.pathname}${u.search}`;
}

export function sharePathForInstallNext(pathname: string, search: string): string {
  try {
    const u = new URL(`${pathname}${search}`, 'https://local.invalid');
    u.searchParams.delete('fw');
    u.searchParams.delete(SHARE_INSTALL_NEXT_PARAM);
    const q = u.searchParams.toString();
    return `${u.pathname}${q ? `?${q}` : ''}`;
  } catch {
    return pathname;
  }
}