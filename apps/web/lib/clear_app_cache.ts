/** 清除 Service Worker 与 Cache API 缓存，保留 localStorage（读经记录、账号等） */
export async function clearAppCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }

  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

/** 清除缓存后带参刷新，绕过 CDN/Nginx 对 / 的长期缓存 */
export function reloadBypassingShellCache(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('_nc', String(Date.now()));
  window.location.replace(url.toString());
}

export async function clearAppCacheAndReload(): Promise<void> {
  await clearAppCache();
  reloadBypassingShellCache();
}
