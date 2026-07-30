/** 分享回流场景：PWA 安装引导的 dismiss / 冷却 / 每会话一次 */

export const SHARE_PWA_DISMISS_KEY = 'pwa-install-from-share-dismissed';
export const SHARE_PWA_SESSION_KEY = 'pwa-share-prompt-session';
/** 冷却 1 天（分享漏斗可比全站略积极） */
export const SHARE_PWA_COOLDOWN_MS = 1 * 24 * 60 * 60 * 1000;

function migrateLegacyShareDismiss(): void {
  try {
    const raw = localStorage.getItem(SHARE_PWA_DISMISS_KEY);
    if (raw === '1') {
      localStorage.setItem(SHARE_PWA_DISMISS_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }
}

function isShareInCooldown(): boolean {
  if (typeof window === 'undefined') return false;
  migrateLegacyShareDismiss();
  try {
    const raw = localStorage.getItem(SHARE_PWA_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SHARE_PWA_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function isShareSessionConsumed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(SHARE_PWA_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** 冷却中或本会话已出过 → 被动引导不再出（standalone 由调用方拦） */
export function isSharePwaDismissed(): boolean {
  return isShareInCooldown() || isShareSessionConsumed();
}

export function noteSharePwaShown(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SHARE_PWA_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function dismissSharePwaGuide(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHARE_PWA_DISMISS_KEY, String(Date.now()));
    sessionStorage.setItem(SHARE_PWA_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 安装成功后清掉分享引导冷却，避免已装用户再被挡 */
export function clearSharePwaDismiss(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SHARE_PWA_DISMISS_KEY);
    sessionStorage.removeItem(SHARE_PWA_SESSION_KEY);
  } catch {
    /* ignore */
  }
  void import('./pwa_install_prompt').then((m) => m.clearInstallPromptDismiss());
}

/** 当前是否在分享落地路径（用于隐藏全站 InstallBanner / 底栏） */
export function isShareLandingPath(pathname: string | null | undefined): boolean {
  const p = (pathname || '').split('?')[0] || '';
  return (
    p === '/share/analysis'
    || p.startsWith('/share/analysis/')
    || p === '/share/app'
    || p.startsWith('/share/app/')
    || p === '/share/daily-verse'
    || p.startsWith('/share/daily-verse/')
    || p === '/share/campaign'
    || p.startsWith('/share/campaign/')
    || p === '/share/wrapped'
    || p.startsWith('/share/wrapped/')
  );
}
