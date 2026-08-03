'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import { clearAppCacheAndReload } from '@/lib/clear_app_cache';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
const RELOAD_GUARD_KEY = 'presto_shell_version_reload';

function isLegacyHomeHtml(html: string): boolean {
  return (
    html.includes('3,842') ||
    html.includes('知识闯关') ||
    (!html.includes('每日问答') && html.includes('今日 12 分钟'))
  );
}

function parseAppVersion(html: string): string | null {
  const m =
    html.match(/name=["']app-version["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+name=["']app-version["']/i);
  return m?.[1] ?? null;
}

/**
 * 检测到线上已是更新构建，但本会话仍跑旧壳（SW / Nginx 缓存）时清 SW 并硬刷。
 * TWA 长驻 WebView 比 Safari PWA 更常出现「服务器已新、界面仍旧」。
 */
export default function StaleShellGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (APP_VERSION === 'dev') return;

    const embedded =
      document.querySelector('meta[name="app-version"]')?.getAttribute('content') || APP_VERSION;

    const base = BASE_PATH || '';
    const home = `${base}/`;
    const probeUrl = `${window.location.origin}${home}?_nc=${Date.now()}`;

    let cancelled = false;

    const markAndReload = async (from: string, to: string) => {
      const guard = `${from}->${to}`;
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === guard) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, guard);
      } catch {
        /* ignore */
      }
      await clearAppCacheAndReload();
    };

    const currentHtml = document.documentElement.outerHTML;
    if (isLegacyHomeHtml(currentHtml)) {
      void markAndReload(embedded, 'legacy-home');
      return () => {
        cancelled = true;
      };
    }

    fetch(probeUrl, { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((fresh) => {
        if (cancelled || !fresh) return;
        const remote = parseAppVersion(fresh);
        if (!remote || remote === 'dev') return;
        // 线上 meta 已是新 SHA，本页仍是旧嵌入版本 → 强制脱壳
        if (remote !== embedded) {
          void markAndReload(embedded, remote);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
