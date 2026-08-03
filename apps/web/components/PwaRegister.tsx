'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import { initNotificationServices } from '@/lib/notifications';

import { initDeferredInstallPrompt } from '@/lib/pwa_deferred_prompt';

const UPDATE_POLL_MS = 60_000;

/**
 * 注册 SW 并主动拉更新。
 * TWA/长驻 WebView 不会每次冷启动文档，仅 register() 时检查不足以「立刻吃新包」。
 */
export default function PwaRegister() {
  useEffect(() => {
    initDeferredInstallPrompt();
    if (!('serviceWorker' in navigator)) return;

    const scope = `${BASE_PATH || ''}/`;
    const url = `${BASE_PATH || ''}/sw.js`;
    let cancelled = false;
    let reloading = false;
    // 首次注册也会 claim → controllerchange；仅「已有旧 SW 被顶掉」时刷新
    let hadController = !!navigator.serviceWorker.controller;

    const safeReload = () => {
      if (reloading || cancelled) return;
      reloading = true;
      // 新控制器接管后换页；用 _nc 绕过 Nginx 对 / 的精确路径缓存
      const next = new URL(window.location.href);
      next.searchParams.set('_nc', String(Date.now()));
      window.location.replace(next.toString());
    };

    const onControllerChange = () => {
      if (hadController) {
        safeReload();
        return;
      }
      hadController = true;
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const tryUpdate = (reg: ServiceWorkerRegistration) => {
      reg.update().catch(() => {});
      // 兼容：waiting 已装好但未 activate（若缺 skipWaiting 的旧构建）
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        reg.waiting.postMessage('SKIP_WAITING');
      }
    };

    navigator.serviceWorker
      .register(url, { scope, updateViaCache: 'none' })
      .then((reg) => {
        if (cancelled) return;
        tryUpdate(reg);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              // install 里已 skipWaiting；此处再触发 update 流程兜底
              tryUpdate(reg);
            }
          });
        });
      })
      .catch(() => {});

    const poll = window.setInterval(() => {
      navigator.serviceWorker.getRegistration(scope).then((reg) => {
        if (reg) tryUpdate(reg);
      });
    }, UPDATE_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.serviceWorker.getRegistration(scope).then((reg) => {
        if (reg) tryUpdate(reg);
      });
    };
    const onShellResume = () => {
      navigator.serviceWorker.getRegistration(scope).then((reg) => {
        if (reg) tryUpdate(reg);
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('peiai-shell-resume', onShellResume);

    initNotificationServices();

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('peiai-shell-resume', onShellResume);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
  return null;
}
