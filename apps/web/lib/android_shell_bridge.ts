/** 彼爱安卓 WebView 壳与 H5 桥接：状态栏、通知、分享、本地闹钟、下载 */

import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

type PeiaiShellBridge = {
  setLightStatusBars?: (light: boolean) => void;
  setStatusBarColor?: (colorHex: string) => void;
  retry?: () => void;
  openExternal?: (url: string) => void;
  requestNotifications?: () => void;
  share?: (title: string, text: string, url: string, imageDataUrl: string) => void;
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
  downloadUrl?: (url: string, fileName: string) => string;
  hasShareBridge?: () => boolean;
  hasReminderBridge?: () => boolean;
};

function getShell(): PeiaiShellBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { PeiaiShell?: PeiaiShellBridge };
  return w.PeiaiShell ?? null;
}

/** 深色 UI（全站 dark / 阅读夜色）— 控制状态栏图标深浅，对齐 iOS 内容下沉 */
function isShellNightUi(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return false;

  if (
    root.classList.contains('app-theme-dark')
    || root.classList.contains('app-reader-night')
    || root.classList.contains('group-reader-night')
    || root.dataset.appTheme === 'dark'
    || root.dataset.theme === 'dark'
    || root.dataset.colorScheme === 'dark'
    || body.classList.contains('reader-body-night')
    || body.classList.contains('reader-theme-night')
  ) {
    return true;
  }

  if (
    document.querySelector(
      '.reader-page.reader-theme-night, .reader-page[data-reader-theme="night"]',
    )
  ) {
    return true;
  }

  const meta = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '';
  if (/#0|#1[0-3]|#12|#12181c/i.test(meta)) return true;

  return false;
}

/**
 * 与 iOS PWA black-translucent 一致：系统栏透明，页面自画背景；
 * 仅同步浅/深图标，避免再刷成实色与 H5 顶区色差。
 */
function applyShellChrome() {
  const shell = getShell();
  if (!shell) return;
  const night = isShellNightUi();
  try {
    shell.setLightStatusBars?.(!night);
  } catch {
    /* bridge 可能尚未就绪 */
  }
  // 复位为透明（edge-to-edge）；#AARRGGBB 全透明
  try {
    shell.setStatusBarColor?.('#00000000');
  } catch {
    /* optional */
  }
}

/** 打开提醒等场景：先申请系统通知权限（Android 13+） */
export function requestAndroidShellNotifications(): void {
  if (!isPeiaiAndroidShell()) return;
  try {
    getShell()?.requestNotifications?.();
  } catch {
    /* ignore */
  }
}

export function hasAndroidShellShare(): boolean {
  if (!isPeiaiAndroidShell()) return false;
  const shell = getShell();
  return typeof shell?.share === 'function';
}

export function hasAndroidShellReminder(): boolean {
  if (!isPeiaiAndroidShell()) return false;
  const shell = getShell();
  return typeof shell?.scheduleReminder === 'function';
}

/**
 * 系统分享面板。imageDataUrl 可为 data URL 或空。
 * @returns true 已拉起面板；false 不可用
 */
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
  try {
    const path =
      opts.openPath
      || (opts.kind === 'group' ? '/discover' : '/');
    getShell()?.scheduleReminder?.(
      opts.kind,
      opts.enabled ? 1 : 0,
      Math.max(0, Math.min(23, Math.floor(opts.hour))),
      Math.max(0, Math.min(59, Math.floor(opts.minute))),
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
  if (!isPeiaiAndroidShell()) return;
  try {
    getShell()?.cancelReminder?.(kind);
  } catch {
    /* ignore */
  }
}

/** 同步日读经 + 群晚间本地闹钟（壳内主路径，关 App 仍准点） */
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

/** 打开应用详情设置（权限被拒绝时） */
export function openAndroidShellAppSettings(): void {
  if (!isPeiaiAndroidShell()) return;
  try {
    getShell()?.openAppSettings?.();
  } catch {
    /* ignore */
  }
}

export function downloadViaAndroidShell(url: string, fileName?: string): boolean {
  if (!isPeiaiAndroidShell()) return false;
  const shell = getShell();
  if (typeof shell?.downloadUrl !== 'function') return false;
  try {
    const r = shell.downloadUrl(url, fileName || '');
    return r === 'ok';
  } catch {
    return false;
  }
}

/** 在系统浏览器打开外链 */
export function openViaAndroidShellExternal(url: string): boolean {
  if (!isPeiaiAndroidShell() || !url) return false;
  try {
    getShell()?.openExternal?.(url);
    return true;
  } catch {
    return false;
  }
}

/** 同步系统栏与主题；返回 cleanup */
export function initAndroidShellBridge(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!isPeiaiAndroidShell()) return () => {};

  let raf = 0;
  const scheduleChrome = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      applyShellChrome();
    });
  };

  applyShellChrome();
  void syncAndroidShellAlarms();

  const obs = new MutationObserver(() => scheduleChrome());
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-app-theme'],
    subtree: false,
  });
  if (document.body) {
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      // 读经页 class 在子树；浅层观测即可覆盖 reader-* 
      subtree: false,
    });
  }
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    obs.observe(themeMeta, { attributes: true, attributeFilter: ['content'] });
  }

  const onTheme = () => scheduleChrome();
  window.addEventListener('app-theme-change', onTheme);
  window.addEventListener('presto-theme-change', onTheme);
  window.addEventListener('focus', onTheme);
  window.addEventListener('storage', onTheme);

  const t = window.setTimeout(applyShellChrome, 80);
  const t2 = window.setTimeout(() => {
    void syncAndroidShellAlarms();
  }, 1_200);

  return () => {
    window.clearTimeout(t);
    window.clearTimeout(t2);
    if (raf) window.cancelAnimationFrame(raf);
    obs.disconnect();
    window.removeEventListener('app-theme-change', onTheme);
    window.removeEventListener('presto-theme-change', onTheme);
    window.removeEventListener('focus', onTheme);
    window.removeEventListener('storage', onTheme);
  };
}
