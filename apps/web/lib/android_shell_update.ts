/** 安卓安装包版本健康：主动更新提示 / 旧壳·旧快捷方式迁移 */

import {
  fetchAndroidPackageMeta,
  isAndroidShellUpdateAvailable,
  isPackageVersionNewer,
  parseAndroidShellVersion,
} from '@/lib/app_package_settings';
import {
  isPeiaiAndroidChromeHost,
  isPeiaiAndroidWebViewShell,
} from '@/lib/android_host';
import { isAndroid, isStandalone } from '@/lib/pwa_platform';

/** 低于此版本的 WebView 壳：建议升到 Chrome Host 2.0+ */
export const ANDROID_SHELL_MIN_MODERN = '2.0.0';
export const ANDROID_SHELL_MIN_MODERN_CODE = 20;

export const ANDROID_SHELL_UPDATE_DISMISS_KEY = 'peiai_shell_update_dismissed';
export const ANDROID_SHELL_LEGACY_DISMISS_KEY = 'peiai_shell_legacy_dismissed';
export const ANDROID_SHELL_BATTERY_DISMISS_KEY = 'peiai_shell_battery_dismissed';

export const ANDROID_SHELL_UPDATE_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;
export const ANDROID_SHELL_CRITICAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const ANDROID_SHELL_BATTERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type AndroidShellHealthKind =
  | 'update'
  | 'critical'
  | 'legacy_standalone'
  | 'legacy_webview'
  | 'battery';

export type AndroidShellHealth = {
  kind: AndroidShellHealthKind;
  localVersion?: string;
  latestVersion?: string;
};

function inCooldown(key: string, ms: number): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < ms;
  } catch {
    return true;
  }
}

export function dismissAndroidShellHealth(kind: AndroidShellHealthKind): void {
  if (typeof window === 'undefined') return;
  const key =
    kind === 'legacy_standalone' || kind === 'legacy_webview'
      ? ANDROID_SHELL_LEGACY_DISMISS_KEY
      : kind === 'battery'
        ? ANDROID_SHELL_BATTERY_DISMISS_KEY
        : ANDROID_SHELL_UPDATE_DISMISS_KEY;
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function isAndroidShellUpdateDismissed(critical: boolean): boolean {
  return inCooldown(
    ANDROID_SHELL_UPDATE_DISMISS_KEY,
    critical ? ANDROID_SHELL_CRITICAL_COOLDOWN_MS : ANDROID_SHELL_UPDATE_COOLDOWN_MS,
  );
}

export function isAndroidLegacyStandaloneDismissed(): boolean {
  return inCooldown(ANDROID_SHELL_LEGACY_DISMISS_KEY, ANDROID_SHELL_UPDATE_COOLDOWN_MS);
}

export function isAndroidShellBatteryDismissed(): boolean {
  return inCooldown(ANDROID_SHELL_BATTERY_DISMISS_KEY, ANDROID_SHELL_BATTERY_COOLDOWN_MS);
}

async function resolveLocalShellVersion(): Promise<{
  versionName: string | null;
  versionCode: number | null;
}> {
  const fromUa = parseAndroidShellVersion();
  try {
    const { readAndroidShellVersion } = await import('./android_shell_bridge');
    const fromBridge = readAndroidShellVersion();
    return {
      versionName: fromBridge.versionName || fromUa.versionName,
      versionCode: fromBridge.versionCode ?? fromUa.versionCode,
    };
  } catch {
    return fromUa;
  }
}

/** 探测安装包/旧 standalone 是否需要健康引导（不含 battery） */
export async function probeAndroidShellHealth(): Promise<AndroidShellHealth | null> {
  if (typeof window === 'undefined') return null;

  // 浏览器「添加到主屏幕」快捷方式（非官网包）
  if (
    isAndroid()
    && isStandalone()
    && !isPeiaiAndroidChromeHost()
    && !isPeiaiAndroidWebViewShell()
  ) {
    if (isAndroidLegacyStandaloneDismissed()) return null;
    return { kind: 'legacy_standalone' };
  }

  // 旧 System WebView 壳：引导覆盖安装 2.0+ Chrome Host
  if (isPeiaiAndroidWebViewShell()) {
    if (isAndroidLegacyStandaloneDismissed()) return null;
    const local = await resolveLocalShellVersion();
    const meta = await fetchAndroidPackageMeta();
    return {
      kind: 'legacy_webview',
      localVersion: local.versionName || undefined,
      latestVersion: meta?.versionName?.trim() || '2.0.0',
    };
  }

  if (!isPeiaiAndroidChromeHost()) return null;

  const local = await resolveLocalShellVersion();
  if (!local.versionName && local.versionCode == null) return null;

  const meta = await fetchAndroidPackageMeta();
  const latest = meta?.versionName?.trim() || '';
  const latestCode = typeof meta?.versionCode === 'number' ? meta.versionCode : null;

  const criticallyOldByName = local.versionName
    ? isPackageVersionNewer(ANDROID_SHELL_MIN_MODERN, local.versionName)
    : false;
  const criticallyOldByCode =
    typeof local.versionCode === 'number'
    && local.versionCode > 0
    && local.versionCode < ANDROID_SHELL_MIN_MODERN_CODE;
  if (criticallyOldByName || criticallyOldByCode) {
    if (isAndroidShellUpdateDismissed(true)) return null;
    return {
      kind: 'critical',
      localVersion: local.versionName || undefined,
      latestVersion: latest || undefined,
    };
  }

  if (
    isAndroidShellUpdateAvailable({
      latestName: latest,
      latestCode,
      localName: local.versionName,
      localCode: local.versionCode,
    })
  ) {
    if (isAndroidShellUpdateDismissed(false)) return null;
    return {
      kind: 'update',
      localVersion: local.versionName || undefined,
      latestVersion: latest || undefined,
    };
  }

  return null;
}
