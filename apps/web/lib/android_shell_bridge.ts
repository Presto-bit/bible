/** 彼爱安卓 WebView 壳与 H5 桥接：状态栏明暗、通知权限等，对齐 PWA 体验 */

import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

type PeiaiShellBridge = {
  setLightStatusBars?: (light: boolean) => void;
  setStatusBarColor?: (colorHex: string) => void;
  retry?: () => void;
  openExternal?: (url: string) => void;
  requestNotifications?: () => void;
};

function getShell(): PeiaiShellBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { PeiaiShell?: PeiaiShellBridge };
  return w.PeiaiShell ?? null;
}

const THEME_BG: Record<string, string> = {
  classic: '#ffffff',
  dawn: '#fff8f3',
  sepia: '#f5f0e1',
  dark: '#12181c',
  night: '#12181c',
  morning: '#fff8f3',
};

/** 深色 UI（全站 dark / 阅读夜色） */
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

function resolveStatusBarColor(): string {
  const root = document.documentElement;
  const appTheme = root.dataset.appTheme || '';
  if (appTheme && THEME_BG[appTheme]) return THEME_BG[appTheme];
  const meta = document.querySelector('meta[name="theme-color"]')?.getAttribute('content');
  if (meta && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(meta.trim())) return meta.trim();
  return isShellNightUi() ? '#12181c' : '#FFFCFA';
}

function applyShellChrome() {
  const shell = getShell();
  if (!shell) return;
  const night = isShellNightUi();
  try {
    shell.setLightStatusBars?.(!night);
  } catch {
    /* bridge 可能尚未就绪 */
  }
  try {
    shell.setStatusBarColor?.(resolveStatusBarColor());
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

/** 同步系统栏与主题；返回 cleanup */
export function initAndroidShellBridge(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!isPeiaiAndroidShell()) return () => {};

  applyShellChrome();

  const obs = new MutationObserver(() => applyShellChrome());
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-app-theme'],
    subtree: false,
  });
  if (document.body) {
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      subtree: true,
    });
  }

  const onTheme = () => applyShellChrome();
  window.addEventListener('app-theme-change', onTheme);
  window.addEventListener('presto-theme-change', onTheme);
  window.addEventListener('focus', onTheme);
  window.addEventListener('storage', onTheme);

  const t = window.setTimeout(applyShellChrome, 80);

  return () => {
    window.clearTimeout(t);
    obs.disconnect();
    window.removeEventListener('app-theme-change', onTheme);
    window.removeEventListener('presto-theme-change', onTheme);
    window.removeEventListener('focus', onTheme);
    window.removeEventListener('storage', onTheme);
  };
}
