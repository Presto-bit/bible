/** 全站 PWA 安装引导：短冷却 + 每会话至多一次（standalone 由调用方拦截） */

export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed';
export const PWA_INSTALL_SESSION_KEY = 'pwa-install-prompt-session';
/** 安卓点过「下载并安装」后长期不再自动弹（直装包无法靠 Play 可靠探测） */
export const ANDROID_TWA_CLAIMED_KEY = 'peiai_android_twa_claimed';
/** 关掉后约 2 天可再被动提醒（主动入口不受限） */
export const PWA_INSTALL_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * 安卓自动安装 Sheet：本页内存态 + 本地 claimed / 短冷却。
 * - 切换 Tab / remount 可保持打开态
 * - 用户关闭 / 已点下载 → 不再自动弹出（刷新也不再弹）
 * - 主动 openPwaInstallSheet 仍可打开
 */
let androidAutoSheetOpen = false;
let androidAutoDismissedThisLoad = false;

export function getAndroidAutoSheetOpen(): boolean {
  return androidAutoSheetOpen;
}

export function setAndroidAutoSheetOpen(open: boolean): void {
  androidAutoSheetOpen = open;
}

export function isAndroidAutoInstallDismissedThisLoad(): boolean {
  return androidAutoDismissedThisLoad;
}

export function dismissAndroidAutoInstallThisLoad(): void {
  androidAutoDismissedThisLoad = true;
  androidAutoSheetOpen = false;
}

/** Banner 已展示：本会话不再自动出现 */
export function noteInstallPromptShown(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PWA_INSTALL_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** 用户已触发 APK 下载：长期抑制自动安装引导 */
export function markAndroidTwaInstallClaimed(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ANDROID_TWA_CLAIMED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  dismissAndroidAutoInstallThisLoad();
  noteInstallPromptShown();
}

export function isAndroidTwaInstallClaimed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(localStorage.getItem(ANDROID_TWA_CLAIMED_KEY));
  } catch {
    return false;
  }
}

function migrateLegacyDismiss(): void {
  try {
    const raw = localStorage.getItem(PWA_INSTALL_DISMISS_KEY);
    if (raw === '1') {
      // 旧「永久 dismiss」改为从现在起进入一轮冷却
      localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }
}

function isInCooldown(): boolean {
  if (typeof window === 'undefined') return false;
  migrateLegacyDismiss();
  try {
    const raw = localStorage.getItem(PWA_INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < PWA_INSTALL_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function isSessionConsumed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(PWA_INSTALL_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** 被动 Banner / 自动 Sheet：冷却中或本会话已出现过则不再出 */
export function isInstallPromptSuppressed(): boolean {
  return isInCooldown() || isSessionConsumed();
}

/** 安卓自动 Sheet：已认领 / 短冷却 / 本页已关（不含「本 session 已展示」以免打开瞬间误关） */
export function isAndroidInstallAutoSuppressed(): boolean {
  return (
    isAndroidTwaInstallClaimed()
    || isInCooldown()
    || isAndroidAutoInstallDismissedThisLoad()
  );
}

/** 用户点「暂不」/关闭：短冷却 + 本会话不再出 */
export function dismissInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
    sessionStorage.setItem(PWA_INSTALL_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
  dismissAndroidAutoInstallThisLoad();
}

/** 安装成功后清冷却（桌面 PWA 等）；安卓 TWA 请用 markAndroidTwaInstallClaimed */
export function clearInstallPromptDismiss(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PWA_INSTALL_DISMISS_KEY);
    sessionStorage.removeItem(PWA_INSTALL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
