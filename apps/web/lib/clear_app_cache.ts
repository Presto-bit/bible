/** 清除 Service Worker 与 Cache API 缓存，保留 localStorage（读经记录、账号等） */

import { isPeiaiAndroidWebViewShell } from '@/lib/pwa_platform';

/** 清除 SW / Cache API；仅旧 WebView 壳另清系统 HTTP 缓存 */
export async function clearAppCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* ignore */
    }
  }

  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  }

  // Chrome Host 不需要清 WebView 缓存；仅旧壳
  if (isPeiaiAndroidWebViewShell()) {
    try {
      const { clearAndroidShellWebViewCache } = await import('@/lib/android_shell_bridge');
      clearAndroidShellWebViewCache();
      await new Promise((r) => window.setTimeout(r, 80));
    } catch {
      /* 旧壳无桥 */
    }
  }
}

/** 清除缓存后带参刷新，绕过 CDN/Nginx 对 / 的长期缓存 */
export function reloadBypassingShellCache(): void {
  if (typeof window === 'undefined') return;

  // 旧 WebView 壳：原生 hardReload 更干净
  if (isPeiaiAndroidWebViewShell()) {
    try {
      const shell = (window as Window & {
        PeiaiShell?: { hardReloadFromOrigin?: () => string };
      }).PeiaiShell;
      if (typeof shell?.hardReloadFromOrigin === 'function') {
        if (shell.hardReloadFromOrigin() === 'ok') return;
      }
    } catch {
      /* fall through */
    }
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_nc', String(Date.now()));
  window.location.replace(url.toString());
}

export async function clearAppCacheAndReload(): Promise<void> {
  await clearAppCache();
  reloadBypassingShellCache();
}
