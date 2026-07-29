/** 分享回流场景：PWA 安装引导的 dismiss / 冷却 */

export const SHARE_PWA_DISMISS_KEY = 'pwa-install-from-share-dismissed';
/** 冷却 14 天 */
export const SHARE_PWA_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function isSharePwaDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(SHARE_PWA_DISMISS_KEY);
  if (!raw) return false;
  if (raw === '1') return true;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < SHARE_PWA_COOLDOWN_MS;
}

export function dismissSharePwaGuide(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SHARE_PWA_DISMISS_KEY, String(Date.now()));
}

/** 当前是否在分享落地路径（用于隐藏全站 InstallBanner） */
export function isShareLandingPath(pathname: string | null | undefined): boolean {
  const p = (pathname || '').split('?')[0] || '';
  return (
    p === '/share/analysis' ||
    p.startsWith('/share/analysis/') ||
    p === '/share/app' ||
    p.startsWith('/share/app/')
  );
}
