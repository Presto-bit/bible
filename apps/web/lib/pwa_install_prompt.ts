/** 全站 PWA 安装引导：短冷却 + 每会话至多一次（standalone 由调用方拦截） */

export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed';
export const PWA_INSTALL_SESSION_KEY = 'pwa-install-prompt-session';
/** 关掉后约 2 天可再被动提醒（主动入口不受限） */
export const PWA_INSTALL_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

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

/** Banner 已展示：本会话不再自动出现 */
export function noteInstallPromptShown(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PWA_INSTALL_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
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
}

/** 安装成功后清冷却，避免已装用户被历史状态挡住主动入口以外的逻辑 */
export function clearInstallPromptDismiss(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PWA_INSTALL_DISMISS_KEY);
    sessionStorage.removeItem(PWA_INSTALL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
