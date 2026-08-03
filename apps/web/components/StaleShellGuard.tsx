'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import { clearAppCacheAndReload } from '@/lib/clear_app_cache';
import { shouldDeferShellInterrupt } from '@/lib/im_session_gate';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';
import { purgeShellTouchBlockers } from '@/lib/sheet_overlay';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
const RELOAD_GUARD_KEY = 'presto_shell_version_reload';
const RELOAD_ATTEMPTS_KEY = 'presto_shell_version_reload_n';
const PENDING_RELOAD_KEY = 'presto_shell_reload_pending';
/** 同一 from→to 最多硬刷次数（防死循环；失败后仍可再试） */
const MAX_RELOAD_ATTEMPTS = 3;
/** 安卓壳：探测成功且一致时节流，避免 resume 狂刷 */
const SHELL_ALIGN_OK_KEY = 'presto_shell_align_ok_at';
const SHELL_ALIGN_MIN_MS = 8_000;

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

function parseSwCacheVersion(swText: string): string | null {
  const m = swText.match(/const\s+CACHE\s*=\s*['"]presto-bible-([^'"]+)['"]/);
  return m?.[1] ?? null;
}

function clearReloadGuards() {
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    sessionStorage.removeItem(RELOAD_ATTEMPTS_KEY);
    sessionStorage.removeItem(PENDING_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

function readMetaVersion(): string {
  if (typeof document === 'undefined') return APP_VERSION;
  return (
    document.querySelector('meta[name="app-version"]')?.getAttribute('content')
    || APP_VERSION
  );
}

/**
 * 检测到线上已是更新构建，但本会话仍跑旧壳（SW / Nginx / WebView HTTP 缓存）时清缓存并硬刷。
 * 安卓壳：resume / 可见时强制对齐公网 app-version 与 SW CACHE；探测一致后卸触摸锁。
 * IM 会话中推迟硬刷，离开聊天后再执行。
 */
export default function StaleShellGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (APP_VERSION === 'dev') return;

    const base = BASE_PATH || '';
    const home = `${base}/`;
    const swPath = `${base}/sw.js`;
    const inShell = isPeiaiAndroidShell();

    let cancelled = false;
    let probing = false;

    const runReload = async (from: string, to: string) => {
      const guard = `${from}->${to}`;
      try {
        const prev = sessionStorage.getItem(RELOAD_GUARD_KEY);
        const attempts = Number(sessionStorage.getItem(RELOAD_ATTEMPTS_KEY) || '0');
        if (prev === guard && attempts >= MAX_RELOAD_ATTEMPTS) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, guard);
        sessionStorage.setItem(
          RELOAD_ATTEMPTS_KEY,
          String(prev === guard ? attempts + 1 : 1),
        );
        sessionStorage.removeItem(PENDING_RELOAD_KEY);
      } catch {
        /* ignore */
      }
      await clearAppCacheAndReload();
    };

    const markAndReload = async (from: string, to: string) => {
      if (shouldDeferShellInterrupt()) {
        try {
          sessionStorage.setItem(PENDING_RELOAD_KEY, `${from}->${to}`);
        } catch {
          /* ignore */
        }
        return;
      }
      await runReload(from, to);
    };

    const flushPendingReload = () => {
      if (cancelled || shouldDeferShellInterrupt()) return;
      let pending: string | null = null;
      try {
        pending = sessionStorage.getItem(PENDING_RELOAD_KEY);
      } catch {
        return;
      }
      if (!pending) return;
      const parts = pending.split('->');
      const from = parts[0] || readMetaVersion();
      const to = parts[1] || 'pending';
      void runReload(from, to);
    };

    /**
     * @param force 壳 resume 时为 true：忽略短时节流，务必与公网对齐
     */
    const probe = (force = false) => {
      if (cancelled || probing) return;
      if (document.visibilityState === 'hidden') return;

      if (inShell && !force) {
        try {
          const lastOk = Number(sessionStorage.getItem(SHELL_ALIGN_OK_KEY) || '0');
          if (lastOk && Date.now() - lastOk < SHELL_ALIGN_MIN_MS) return;
        } catch {
          /* ignore */
        }
      }

      const embedded = readMetaVersion();
      const currentHtml = document.documentElement.outerHTML;

      // 运行中 chunk 的构建号与 HTML meta 不一致 → 混合旧壳
      if (
        APP_VERSION !== 'dev'
        && embedded
        && embedded !== 'dev'
        && embedded !== APP_VERSION
      ) {
        void markAndReload(embedded, APP_VERSION);
        return;
      }

      if (isLegacyHomeHtml(currentHtml)) {
        void markAndReload(embedded, 'legacy-home');
        return;
      }

      probing = true;
      const nc = Date.now();
      const probeUrl = `${window.location.origin}${home}?_nc=${nc}`;
      const swUrl = `${window.location.origin}${swPath}?_nc=${nc}`;

      Promise.all([
        fetch(probeUrl, { cache: 'no-store', credentials: 'same-origin' })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
        fetch(swUrl, { cache: 'no-store', credentials: 'same-origin' })
          .then((r) => (r.ok ? r.text() : ''))
          .catch(() => ''),
      ])
        .then(([fresh, swText]) => {
          if (cancelled) return;

          const remote = fresh ? parseAppVersion(fresh) : null;
          const swVer = swText ? parseSwCacheVersion(swText) : null;
          const live = readMetaVersion();

          // 本页已与线上一致：记 ok，卸可能残留的触摸锁（壳 resume）
          if (remote && remote !== 'dev' && remote === live) {
            const swOk = !swVer || swVer === 'v45' || swVer === remote;
            if (swOk) {
              clearReloadGuards();
              try {
                sessionStorage.setItem(SHELL_ALIGN_OK_KEY, String(Date.now()));
              } catch {
                /* ignore */
              }
              if (inShell && force) {
                try {
                  purgeShellTouchBlockers();
                } catch {
                  /* ignore */
                }
              }
              return;
            }
          }

          if (remote && remote !== 'dev' && remote !== live) {
            void markAndReload(live, remote);
            return;
          }

          // HTML 已新但 SW CACHE 仍是旧烙印
          if (
            swVer
            && swVer !== 'v45'
            && swVer !== live
            && remote
            && remote !== 'dev'
          ) {
            void markAndReload(live, `sw-${swVer}`);
            return;
          }

          // 安卓壳：SW 与 meta 不一致时更积极
          if (
            inShell
            && swVer
            && swVer !== 'v45'
            && swVer !== live
          ) {
            void markAndReload(live, `sw-${swVer}`);
            return;
          }

          // 强制 resume：远程与 SW 都拿到且一致，但本页仍可能被僵尸遮罩卡死
          if (inShell && force) {
            try {
              purgeShellTouchBlockers();
            } catch {
              /* ignore */
            }
          }
        })
        .finally(() => {
          probing = false;
        });
    };

    // 冷启动
    probe(true);

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      flushPendingReload();
      probe(inShell);
    };
    const onShellResume = () => {
      flushPendingReload();
      // 强制版本对齐：忽略节流
      probe(true);
    };
    const onNav = () => {
      window.setTimeout(flushPendingReload, 80);
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('peiai-shell-resume', onShellResume);
    window.addEventListener('presto-tab-nav', onNav);
    window.addEventListener('popstate', onNav);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('peiai-shell-resume', onShellResume);
      window.removeEventListener('presto-tab-nav', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  return null;
}
