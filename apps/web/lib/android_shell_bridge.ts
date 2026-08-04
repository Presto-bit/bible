/**
 * 安卓安装包能力桥（白名单）：
 * - Chrome Host 2.0+：peiai://host/v1/...
 * - 旧 WebView 壳：window.PeiaiShell（只读兼容，不再扩展）
 *
 * 不做：社交原生通知中心、分享面板、状态栏染色、WebView 清缓存（Chrome 不需要）。
 */

import {
  getAndroidHostVersion,
  invokeAndroidCapability,
  isPeiaiAndroidCapabilityHost,
  isPeiaiAndroidChromeHost,
  isPeiaiAndroidWebViewShell,
} from '@/lib/android_host';

type PeiaiShellBridge = {
  requestNotifications?: () => void;
  scheduleReminder?: (
    kind: string,
    enabled: number,
    hour: number,
    minute: number,
    title: string,
    body: string,
    openPath: string,
  ) => void;
  cancelReminder?: (kind: string) => void;
  openAppSettings?: () => void;
  openExactAlarmSettings?: () => void;
  openBatteryOptimizationSettings?: () => void;
  isBatteryOptimizationExempt?: () => boolean;
  getVersionName?: () => string;
  getVersionCode?: () => number;
  downloadUrl?: (url: string, fileName: string) => string;
  openExternal?: (url: string) => void;
  clearWebViewCache?: () => string;
  hardReloadFromOrigin?: () => string;
  /** 以下为旧壳遗留，新宿主不提供 */
  showNotification?: (
    title: string,
    body: string,
    openPath: string,
    tag: string,
  ) => string;
  hasNotificationBridge?: () => boolean;
  share?: (title: string, text: string, url: string, imageDataUrl: string) => void;
  hasShareBridge?: () => boolean;
  hasReminderBridge?: () => boolean;
  setLightStatusBars?: (light: boolean) => void;
  setStatusBarColor?: (colorHex: string) => void;
};

function getShell(): PeiaiShellBridge | null {
  if (typeof window === 'undefined') return null;
  if (!isPeiaiAndroidWebViewShell()) return null;
  const w = window as Window & { PeiaiShell?: PeiaiShellBridge };
  return w.PeiaiShell ?? null;
}

function enc(v: string): string {
  return encodeURIComponent(v || '');
}

/** 打开提醒等场景：先申请系统通知权限（Android 13+） */
export function requestAndroidShellNotifications(): void {
  if (!isPeiaiAndroidCapabilityHost()) return;
  if (isPeiaiAndroidChromeHost()) {
    invokeAndroidCapability('v1/requestNotifications');
    return;
  }
  try {
    getShell()?.requestNotifications?.();
  } catch {
    /* ignore */
  }
}

/** Chrome Host 不提供分享桥；旧壳若有则保留 */
export function hasAndroidShellShare(): boolean {
  if (!isPeiaiAndroidWebViewShell()) return false;
  const shell = getShell();
  return typeof shell?.share === 'function';
}

export function hasAndroidShellReminder(): boolean {
  if (isPeiaiAndroidChromeHost()) return true;
  if (!isPeiaiAndroidWebViewShell()) return false;
  const shell = getShell();
  return typeof shell?.scheduleReminder === 'function';
}

/** 社交摘要：新宿主走 Web Push；旧壳仍可读桥 */
export function hasAndroidShellNotification(): boolean {
  if (isPeiaiAndroidChromeHost()) return false;
  if (!isPeiaiAndroidWebViewShell()) return false;
  const shell = getShell();
  if (typeof shell?.hasNotificationBridge === 'function') {
    try {
      return Boolean(shell.hasNotificationBridge());
    } catch {
      /* fall through */
    }
  }
  return typeof shell?.showNotification === 'function';
}

export function showAndroidShellNotification(opts: {
  title: string;
  body: string;
  openPath?: string;
  tag?: string;
}): boolean {
  if (!hasAndroidShellNotification()) return false;
  try {
    const r = getShell()?.showNotification?.(
      opts.title || '',
      opts.body || '',
      opts.openPath || '/discover',
      opts.tag || '',
    );
    return r === 'ok';
  } catch {
    return false;
  }
}

export function shareViaAndroidShell(opts: {
  title: string;
  text: string;
  url: string;
  imageDataUrl?: string;
}): boolean {
  if (!hasAndroidShellShare()) return false;
  try {
    getShell()?.share?.(
      opts.title || '',
      opts.text || '',
      opts.url || '',
      opts.imageDataUrl || '',
    );
    return true;
  } catch {
    return false;
  }
}

/** 挂载/更新本地准点提醒；enabled=false 取消 */
export function scheduleAndroidShellReminder(opts: {
  kind: 'daily' | 'group';
  enabled: boolean;
  hour: number;
  minute: number;
  title?: string;
  body?: string;
  openPath?: string;
}): boolean {
  if (!hasAndroidShellReminder()) return false;
  const path =
    opts.openPath
    || (opts.kind === 'group' ? '/discover' : '/');
  const hour = Math.max(0, Math.min(23, Math.floor(opts.hour)));
  const minute = Math.max(0, Math.min(59, Math.floor(opts.minute)));

  if (isPeiaiAndroidChromeHost()) {
    return invokeAndroidCapability(
      `v1/scheduleReminder?kind=${enc(opts.kind)}`
        + `&enabled=${opts.enabled ? 1 : 0}`
        + `&hour=${hour}&minute=${minute}`
        + `&title=${enc(opts.title || '')}`
        + `&body=${enc(opts.body || '')}`
        + `&path=${enc(path)}`,
    );
  }
  try {
    getShell()?.scheduleReminder?.(
      opts.kind,
      opts.enabled ? 1 : 0,
      hour,
      minute,
      opts.title || '',
      opts.body || '',
      path,
    );
    return true;
  } catch {
    return false;
  }
}

export function cancelAndroidShellReminder(kind: 'daily' | 'group'): void {
  if (!isPeiaiAndroidCapabilityHost()) return;
  if (isPeiaiAndroidChromeHost()) {
    invokeAndroidCapability(`v1/cancelReminder?kind=${enc(kind)}`);
    return;
  }
  try {
    getShell()?.cancelReminder?.(kind);
  } catch {
    /* ignore */
  }
}

/** 同步日读经 + 群晚间本地闹钟（关 App 仍准点） */
export async function syncAndroidShellAlarms(): Promise<void> {
  if (!hasAndroidShellReminder()) return;
  requestAndroidShellNotifications();
  try {
    const { getReminder } = await import('./reminder');
    const rem = getReminder();
    scheduleAndroidShellReminder({
      kind: 'daily',
      enabled: rem.enabled,
      hour: rem.hour,
      minute: rem.minute,
      title: '彼爱 · 今日读经',
      body: '愿话语成为你脚前的灯，点开继续今天的阅读。',
      openPath: '/',
    });
  } catch {
    /* ignore */
  }
  try {
    const { getGroupEveningReminder } = await import('./group_reminder');
    const g = getGroupEveningReminder();
    scheduleAndroidShellReminder({
      kind: 'group',
      enabled: g.enabled,
      hour: g.hour,
      minute: g.minute,
      title: '群打卡提醒',
      body: '还在等你轻轻完成今天的打卡。',
      openPath: '/discover',
    });
  } catch {
    /* ignore */
  }
}

export function openAndroidShellAppSettings(): void {
  if (!isPeiaiAndroidCapabilityHost()) return;
  if (isPeiaiAndroidChromeHost()) {
    invokeAndroidCapability('v1/openAppSettings');
    return;
  }
  try {
    getShell()?.openAppSettings?.();
  } catch {
    /* ignore */
  }
}

/** Chrome Host 无法同步读电池状态：默认 false 以便引导一次；用户关掉半屏后冷却 */
export function isAndroidShellBatteryExempt(): boolean {
  if (isPeiaiAndroidChromeHost()) return false;
  if (!isPeiaiAndroidWebViewShell()) return true;
  const shell = getShell();
  if (typeof shell?.isBatteryOptimizationExempt !== 'function') return true;
  try {
    return Boolean(shell.isBatteryOptimizationExempt());
  } catch {
    return true;
  }
}

export function openAndroidShellBatterySettings(): void {
  if (!isPeiaiAndroidCapabilityHost()) return;
  if (isPeiaiAndroidChromeHost()) {
    invokeAndroidCapability('v1/openBatterySettings');
    return;
  }
  try {
    const shell = getShell();
    if (typeof shell?.openBatteryOptimizationSettings === 'function') {
      shell.openBatteryOptimizationSettings();
      return;
    }
    shell?.openAppSettings?.();
  } catch {
    /* ignore */
  }
}

export function readAndroidShellVersion(): {
  versionName: string | null;
  versionCode: number | null;
} {
  const fromHost = getAndroidHostVersion();
  if (fromHost.versionName || fromHost.versionCode != null) {
    return {
      versionName: fromHost.versionName,
      versionCode: fromHost.versionCode,
    };
  }
  if (!isPeiaiAndroidWebViewShell()) {
    return { versionName: null, versionCode: null };
  }
  const shell = getShell();
  let versionName: string | null = null;
  let versionCode: number | null = null;
  try {
    if (typeof shell?.getVersionName === 'function') {
      const n = String(shell.getVersionName() || '').trim();
      if (n) versionName = n;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof shell?.getVersionCode === 'function') {
      const c = Number(shell.getVersionCode());
      if (Number.isFinite(c) && c > 0) versionCode = Math.floor(c);
    }
  } catch {
    /* ignore */
  }
  return { versionName, versionCode };
}

/** 壳内下载：Chrome Host 走系统/Chrome 下载；旧壳走 bridge */
export function downloadViaAndroidShell(url: string, fileName?: string): boolean {
  if (isPeiaiAndroidChromeHost()) {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || '';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      window.location.href = url;
      return true;
    }
  }
  if (!isPeiaiAndroidWebViewShell()) return false;
  const shell = getShell();
  if (typeof shell?.downloadUrl !== 'function') return false;
  try {
    return shell.downloadUrl(url, fileName || '') === 'ok';
  } catch {
    return false;
  }
}

/** Chrome 托管缓存：无 WebView 缓存可清 */
export function clearAndroidShellWebViewCache(): boolean {
  if (isPeiaiAndroidChromeHost()) return false;
  if (!isPeiaiAndroidWebViewShell()) return false;
  const shell = getShell();
  if (typeof shell?.clearWebViewCache !== 'function') return false;
  try {
    return shell.clearWebViewCache() === 'ok';
  } catch {
    return false;
  }
}

/** 硬刷：Chrome Host 用标准 reload；旧壳可走 bridge */
export function hardReloadAndroidShellFromOrigin(): boolean {
  if (isPeiaiAndroidChromeHost()) {
    try {
      const origin = `${window.location.origin}/?_nc=${Date.now()}`;
      window.location.replace(origin);
      return true;
    } catch {
      return false;
    }
  }
  if (!isPeiaiAndroidWebViewShell()) return false;
  const shell = getShell();
  if (typeof shell?.hardReloadFromOrigin !== 'function') return false;
  try {
    return shell.hardReloadFromOrigin() === 'ok';
  } catch {
    return false;
  }
}

/** 外链：Chrome Host 让浏览器处理；旧壳可 openExternal */
export function openViaAndroidShellExternal(url: string): boolean {
  if (!url) return false;
  if (isPeiaiAndroidChromeHost()) {
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    } catch {
      return false;
    }
  }
  if (!isPeiaiAndroidWebViewShell()) return false;
  try {
    getShell()?.openExternal?.(url);
    return true;
  } catch {
    return false;
  }
}

/** 通过能力宿主安装/更新 APK（仅 Chrome Host） */
export function installAndroidPackageViaHost(apkUrl: string): boolean {
  if (!isPeiaiAndroidChromeHost() || !apkUrl) return false;
  return invokeAndroidCapability(`v1/installApk?url=${enc(apkUrl)}`);
}

/**
 * 初始化：同步闹钟。Chrome Host 无需状态栏桥（由 Chrome / CSS 处理）。
 */
export function initAndroidShellBridge(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!isPeiaiAndroidCapabilityHost()) return () => {};

  void syncAndroidShellAlarms();
  const t2 = window.setTimeout(() => {
    void syncAndroidShellAlarms();
  }, 1_200);

  return () => {
    window.clearTimeout(t2);
  };
}
