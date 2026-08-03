/** 全站安装引导：安卓装包 vs 桌面/iOS 冷却分流 */

export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed';
export const PWA_INSTALL_SESSION_KEY = 'pwa-install-prompt-session';
/**
 * 硬认领：确认已装或探测到已装 → 自动 Sheet 永久不再弹。
 * 勿在「仅点击下载」时写入；下载后刷新仍应再催直到真装完。
 */
export const ANDROID_TWA_CLAIMED_KEY = 'peiai_android_twa_claimed';
/** 旧版「一点下载即 claimed」迁移：一次性清掉伪认领，按新规则再弹 */
const ANDROID_CLAIM_POLICY_V2 = 'peiai_android_apk_claim_v2';
/** 桌面/iOS Banner：关掉后约 2 天可再被动提醒（安卓自动 Sheet 不用） */
export const PWA_INSTALL_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * 安卓自动安装 Sheet（仅内存 + 硬认领）：
 * - 进入浏览器未安装 → 自动弹
 * - 关闭 → 只本页不再弹
 * - 刷新 → 若未硬认领则再弹
 * - 主动 openPwaInstallSheet 始终可开
 */
let androidAutoSheetOpen = false;
let androidAutoDismissedThisLoad = false;

function migrateAndroidClaimPolicyV2(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(ANDROID_CLAIM_POLICY_V2) === '1') return;
    // 清除旧「下载即 claimed」，避免未装用户刷新也不再催
    localStorage.removeItem(ANDROID_TWA_CLAIMED_KEY);
    localStorage.setItem(ANDROID_CLAIM_POLICY_V2, '1');
  } catch {
    /* ignore */
  }
}

export function getAndroidAutoSheetOpen(): boolean {
  return androidAutoSheetOpen;
}

export function setAndroidAutoSheetOpen(open: boolean): void {
  androidAutoSheetOpen = open;
}

export function isAndroidAutoInstallDismissedThisLoad(): boolean {
  return androidAutoDismissedThisLoad;
}

/** 本页关闭自动 Sheet；刷新后标志丢失 → 可再弹 */
export function dismissAndroidAutoInstallThisLoad(): void {
  androidAutoDismissedThisLoad = true;
  androidAutoSheetOpen = false;
}

/** 恢复本页可再自动弹（一般不用；主动重开自动逻辑时） */
export function resetAndroidAutoInstallThisLoad(): void {
  androidAutoDismissedThisLoad = false;
}

/** Banner（桌面/iOS）：本会话不再自动出现 */
export function noteInstallPromptShown(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PWA_INSTALL_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * 硬认领：探测到已装 / 用户点「我已安装」。
 * 此后安卓浏览器不再自动弹装包 Sheet。
 */
export function markAndroidTwaInstallClaimed(): void {
  if (typeof window === 'undefined') return;
  migrateAndroidClaimPolicyV2();
  try {
    localStorage.setItem(ANDROID_TWA_CLAIMED_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  dismissAndroidAutoInstallThisLoad();
}

export function isAndroidTwaInstallClaimed(): boolean {
  if (typeof window === 'undefined') return false;
  migrateAndroidClaimPolicyV2();
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

/** 桌面/iOS 被动 Banner：冷却中或本会话已出现过则不再出 */
export function isInstallPromptSuppressed(): boolean {
  return isInCooldown() || isSessionConsumed();
}

/**
 * 安卓自动 Sheet 抑制条件（不含 2 天冷却、不含 session banner）：
 * - 硬认领已装
 * - 本页用户已关掉（刷新后重置）
 */
export function isAndroidInstallAutoSuppressed(): boolean {
  migrateAndroidClaimPolicyV2();
  return isAndroidTwaInstallClaimed() || isAndroidAutoInstallDismissedThisLoad();
}

/** 桌面/iOS 点「暂不」：短冷却 + 本会话；安卓装包自动路径请用 dismissAndroidAutoInstallThisLoad */
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

/** 安装成功后清冷却（桌面 PWA 等） */
export function clearInstallPromptDismiss(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PWA_INSTALL_DISMISS_KEY);
    sessionStorage.removeItem(PWA_INSTALL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
