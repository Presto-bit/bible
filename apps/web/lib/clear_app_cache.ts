/** 清除 Service Worker 与 Cache API 缓存，保留 localStorage（读经记录、账号等） */

import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

/** 清除 SW / Cache API；安卓壳另清系统 WebView HTTP 缓存 */
export async function clearAppCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  // 先卸 SW，再清 HTTP 缓存，避免 SW 仍用旧网络策略回填
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

  if (isPeiaiAndroidShell()) {
    try {
      const { clearAndroidShellWebViewCache } = await import('@/lib/android_shell_bridge');
      clearAndroidShellWebViewCache();
      // 给原生 clearCache 一帧时间写盘
      await new Promise((r) => window.setTimeout(r, 80));
    } catch {
      /* 旧壳无桥 */
    }
  }
}

/** 清除缓存后带参刷新，绕过 CDN/Nginx 对 / 的长期缓存 */
export function reloadBypassingShellCache(): void {
  if (typeof window === 'undefined') return;

  // 安卓壳：原生 hardReload（清 HTTP 缓存 + load 官网）比 location.replace 更干净
  if (isPeiaiAndroidShell()) {
    try {
      // 同步探测，避免 async 空白窗
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
