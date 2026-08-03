/** 彼爱安卓 WebView 壳与 H5 桥接（状态栏明暗等） */

import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

type PeiaiShellBridge = {
  setLightStatusBars?: (light: boolean) => void;
  retry?: () => void;
  openExternal?: (url: string) => void;
};

function getShell(): PeiaiShellBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { PeiaiShell?: PeiaiShellBridge };
  return w.PeiaiShell ?? null;
}

function isShellNightUi(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  const body = document.body;
  if (!body) return false;
  return (
    body.classList.contains('reader-body-night')
    || body.classList.contains('reader-theme-night')
    || root.classList.contains('reader-theme-night')
    || root.dataset.theme === 'dark'
    || root.dataset.colorScheme === 'dark'
    || root.classList.contains('dark')
    || body.classList.contains('dark')
  );
}

/** 同步系统状态栏/导航栏图标明暗；返回 cleanup */
export function initAndroidShellBridge(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!isPeiaiAndroidShell()) return () => {};

  const apply = () => {
    const shell = getShell();
    if (!shell || typeof shell.setLightStatusBars !== 'function') return;
    try {
      shell.setLightStatusBars(!isShellNightUi());
    } catch {
      /* bridge 可能尚未注入 */
    }
  };

  apply();
  const obs = new MutationObserver(apply);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color-scheme'],
  });
  if (document.body) {
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('presto-theme-change', apply);
  window.addEventListener('focus', apply);
  return () => {
    obs.disconnect();
    window.removeEventListener('presto-theme-change', apply);
    window.removeEventListener('focus', apply);
  };
}
