/** 安卓壳版本健康：主动更新提示 / 旧壳迁移冷却 */

import {
  fetchAndroidPackageMeta,
  isAndroidShellUpdateAvailable,
  isPackageVersionNewer,
  parseAndroidShellVersion,
} from '@/lib/app_package_settings';
import { isAndroid, isPeiaiAndroidShell, isStandalone } from '@/lib/pwa_platform';

/** 低于此版本：无可靠壳内覆盖安装 / 安全区不全，建议重装 */
export const ANDROID_SHELL_MIN_MODERN = '1.0.4';
/** versionCode：1.0.4 = 历史上约 4+；用名称判定为主，code 作辅助 */
export const ANDROID_SHELL_MIN_MODERN_CODE = 4;

export const ANDROID_SHELL_UPDATE_DISMISS_KEY = 'peiai_shell_update_dismissed';
export const ANDROID_SHELL_LEGACY_DISMISS_KEY = 'peiai_shell_legacy_dismissed';
export const ANDROID_SHELL_BATTERY_DISMISS_KEY = 'peiai_shell_battery_dismissed';

/** 普通更新：约 2 天可再提醒；关键旧壳：约 12 小时 */
export const ANDROID_SHELL_UPDATE_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;
export const ANDROID_SHELL_CRITICAL_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const ANDROID_SHELL_BATTERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export type AndroidShellHealthKind =
  | 'update'
  | 'critical'
  | 'legacy_standalone'
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
    kind === 'legacy_standalone'
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

/** 探测壳/旧 standalone 是否需要健康引导（不含 battery，battery 另查） */
export async function probeAndroidShellHealth(): Promise<AndroidShellHealth | null> {
  if (typeof window === 'undefined') return null;

  // 旧真 TWA / 主屏幕快捷方式：无 PeiaiAndroidShell UA
  if (isAndroid() && isStandalone() && !isPeiaiAndroidShell()) {
    if (isAndroidLegacyStandaloneDismissed()) return null;
    return { kind: 'legacy_standalone' };
  }

  if (!isPeiaiAndroidShell()) return null;

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
