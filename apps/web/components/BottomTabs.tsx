'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { dispatchReaderToggleChrome } from '@/lib/reader_chrome';
import { markReaderTabEntry } from '@/lib/reading';
import { isTabKeepAliveEnabled } from '@/lib/platform';
import {
  getPwaTabPathname,
  isPwaMainTabHref,
  navigatePwaTab,
  resolvePwaShellPathname,
  subscribePwaTabNav,
} from '@/lib/pwa_tab_nav';
import { normalizeAppPath } from '@/lib/tab_keep_alive';
import { useOnline } from '@/lib/use_online';
import { isShareLandingPath } from '@/lib/share_pwa_guide';
import { shellTapProps } from '@/lib/shell_tap';
import { isFlutterH5Host } from '@/lib/flutter_h5_bridge';

/**
 * 五 Tab 自绘图标（24×24）：线框 ↔ 实心，对齐贴底标准栏方案。
 * 隐喻：今日=家 / 圣经=摊开书 / 小爱=对话泡 / 发现=双气泡 / 我的=头肩。
 */
const TABS = [
  {
    href: '/',
    label: '今日',
    outline:
      'M12 3.6L4.2 10.2V19a1.2 1.2 0 001.2 1.2h4.1v-5.4h5V20.2h4.1A1.2 1.2 0 0019.8 19v-8.8L12 3.6zm0 2.3l6.2 5.2V18.6h-2.5v-5.4H8.3v5.4H5.8v-7.5L12 5.9z',
    filled:
      'M12 3.2L3.5 10.3V19a1.4 1.4 0 001.4 1.4h5.1v-5.8h4v5.8h5.1a1.4 1.4 0 001.4-1.4v-8.7L12 3.2z',
  },
  {
    href: '/reader',
    label: '圣经',
    // 摊开书：左页线框 / 双页实心
    outline:
      'M6.5 5.25c1.55-.45 3.2-.7 4.9-.7.55 0 1.1.03 1.6.08V17.4c-.5-.12-1.05-.18-1.6-.18-1.55 0-3.05.3-4.35.75a.75.75 0 01-1.05-.7V5.95c0-.32.2-.6.5-.7zm6.5-.62c.5-.05 1.05-.08 1.6-.08 1.7 0 3.35.25 4.9.7.3.1.5.38.5.7v11.32a.75.75 0 01-1.05.7c-1.3-.45-2.8-.75-4.35-.75-.55 0-1.1.06-1.6.18V4.63z',
    filled:
      'M5.2 5c1.7-.55 3.55-.85 5.5-.85.45 0 .9.02 1.3.06V18.2c-.4-.1-.85-.15-1.3-.15-1.85 0-3.55.35-5.05.9A.85.85 0 014 18.2V5.85c0-.35.22-.66.55-.78.2-.07.42-.07.65-.07zm7.1-.79c.4-.04.85-.06 1.3-.06 1.95 0 3.8.3 5.5.85.33.12.55.43.55.78V18.2a.85.85 0 01-1.15.8c-1.5-.55-3.2-.9-5.05-.9-.45 0-.9.05-1.3.15V4.21z',
  },
  {
    href: '/assistant',
    label: '小爱',
    outline:
      'M6.2 5.5h11.6A2.7 2.7 0 0120.5 8.2v7.2a2.7 2.7 0 01-2.7 2.7h-4.1l-3.4 2.9a.7.7 0 01-1.15-.55V18.1H6.2A2.7 2.7 0 013.5 15.4V8.2A2.7 2.7 0 016.2 5.5zm0 1.5a1.2 1.2 0 00-1.2 1.2v7.2c0 .66.54 1.2 1.2 1.2h3.2v2.05l2.35-2.05h5.35c.66 0 1.2-.54 1.2-1.2V8.2c0-.66-.54-1.2-1.2-1.2H6.2zM8.8 10.2h6.4a.75.75 0 010 1.5H8.8a.75.75 0 010-1.5zm0 3h4.2a.75.75 0 010 1.5H8.8a.75.75 0 010-1.5z',
    filled:
      'M6.2 5.2h11.6A3 3 0 0120.8 8.2v7.2a3 3 0 01-3 3h-3.85l-3.55 3.05a.85.85 0 01-1.4-.66V18.4H6.2a3 3 0 01-3-3V8.2a3 3 0 013-3zm2.4 5.2a.75.75 0 000 1.5h6.6a.75.75 0 000-1.5H8.6zm0 3a.75.75 0 000 1.5h4.4a.75.75 0 000-1.5H8.6z',
  },
  {
    href: '/discover',
    label: '发现',
    outline:
      'M8.2 4.8h7.2A2.5 2.5 0 0117.9 7.3v4.6a2.5 2.5 0 01-2.5 2.5h-2.05l-1.85 1.55a.55.55 0 01-.9-.43v-1.12H8.2A2.5 2.5 0 015.7 11.9V7.3A2.5 2.5 0 018.2 4.8zm0 1.4c-.6 0-1.1.5-1.1 1.1v4.6c0 .6.5 1.1 1.1 1.1h2.35v1.15l1.35-1.15h3.9c.6 0 1.1-.5 1.1-1.1V7.3c0-.6-.5-1.1-1.1-1.1H8.2zM5.4 11.6A2.7 2.7 0 003.5 14.2v3.9c0 .9.45 1.7 1.2 2.15v1.55a.55.55 0 00.9.43l1.85-1.55H10a2.7 2.7 0 002.55-1.75H8.9A2.7 2.7 0 016.2 16.1v-4.5H5.4z',
    filled:
      'M8.2 4.5h7.2A2.8 2.8 0 0118.2 7.3v4.6a2.8 2.8 0 01-2.8 2.8h-1.85l-2.05 1.7a.7.7 0 01-1.15-.55v-1.15H8.2A2.8 2.8 0 015.4 11.9V7.3A2.8 2.8 0 018.2 4.5zM4.2 12.4A2.9 2.9 0 002.5 15.2v3.7a2.9 2.9 0 001.35 2.45v1.7a.7.7 0 001.15.55l2.05-1.7H10a2.9 2.9 0 002.7-1.85H8.5A2.9 2.9 0 015.6 16.8v-4.4H4.2z',
  },
  {
    href: '/profile',
    label: '我的',
    outline:
      'M12 4.2a3.8 3.8 0 110 7.6 3.8 3.8 0 010-7.6zm0 1.5a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6zM6.2 18.1c.35-1.85 2.85-3.1 5.8-3.1s5.45 1.25 5.8 3.1H6.2zm-1.55.35C5.1 16.2 8.15 14.5 12 14.5s6.9 1.7 7.35 3.95c.1.45-.25.85-.7.85H5.35c-.45 0-.8-.4-.7-.85z',
    filled:
      'M12 4a4 4 0 110 8 4 4 0 010-8zm0 10c3.95 0 7.15 1.75 7.55 4.15.1.55-.3 1.05-.85 1.05H5.3c-.55 0-.95-.5-.85-1.05C4.85 15.75 8.05 14 12 14z',
  },
];

const SECONDARY_PREFIXES = [
  '/challenge',
  '/notes',
  '/plans',
  '/report',
  '/dictionary',
  '/graph',
  '/login',
  '/search',
  '/wrapped',
  '/shelf',
  '/friend/add',
  '/profile/settings',
  '/profile/reminders',
  '/profile/appearance',
  '/profile/licenses',
  '/admin',
  '/campaigns',
  '/discover/groups',
  '/group/create',
];

const GROUP_COMPACT_RE = /^\/discover\/(group\/|join|dm\/|invites|friends)/;

/** 底部 Tab：用 button 导航，避免 PWA/Safari 长按链接弹出预览与共享 */
export default function BottomTabs() {
  const pathname = normalizeAppPath(useRouterPathname());
  const router = useRouter();
  const online = useOnline();
  const onShareLanding = isShareLandingPath(pathname);
  const compact =
    SECONDARY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    || GROUP_COMPACT_RE.test(pathname);

  useEffect(() => {
    if (onShareLanding) {
      document.body.classList.add('share-landing-active');
      return () => document.body.classList.remove('share-landing-active');
    }
    document.body.classList.remove('share-landing-active');
  }, [onShareLanding]);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.tabbar');
    if (!bar) return;
    // 二级页（含 /campaigns）也清 height，避免从其它页残留导致无法下滑
    document.documentElement.style.removeProperty('height');
    document.body.style.removeProperty('height');
    // 离开群聊/私信后清掉 IM 键盘 / vv-shell 残留，避免主 Tab 错位或卡顿
    if (!compact) {
      document.body.classList.remove(
        'im-vv-shell',
        'im-keyboard',
        'im-keyboard-overlay',
        'im-plus-sheet',
        'im-mention-sheet',
      );
      document.documentElement.style.removeProperty('--im-shell-top');
      document.documentElement.style.removeProperty('--im-shell-h');
      document.documentElement.style.removeProperty('--im-kb-inset');
      document.documentElement.style.removeProperty('--im-vv-top');
      document.documentElement.style.removeProperty('--im-vv-h');
    }
    if (compact) return;
    // 先清残留 inline，保证各 Tab 底栏同位（含刚进入小爱）
    bar.style.removeProperty('transform');
    bar.style.removeProperty('bottom');
    bar.style.removeProperty('top');
    bar.style.removeProperty('opacity');
    bar.style.removeProperty('visibility');
    bar.style.removeProperty('position');
    bar.style.removeProperty('transition');
    bar.style.pointerEvents = '';
    // 仍在小爱页时保留其键盘态 class / CSS 变量，离开后再清
    if (pathname === '/assistant' || pathname.startsWith('/assistant/')) return;
    document.body.classList.remove(
      'assistant-keyboard',
      'assistant-keyboard-vv',
      'assistant-active',
      'assistant-immersive',
      'assistant-tabbar-peek',
    );
    document.documentElement.style.removeProperty('--assistant-vv-h');
    document.documentElement.style.removeProperty('--assistant-vv-top');
    document.documentElement.style.removeProperty('--assistant-kb-inset');
    document.documentElement.style.removeProperty('--assistant-page-h');
    document.documentElement.style.removeProperty('--assistant-overlay-h');
  }, [compact, pathname]);

  // PWA：首页就绪后错峰预热圣经 → 小爱/发现 chunk，弱网首次切入不空等
  useEffect(() => {
    if (!isTabKeepAliveEnabled()) return;
    let cancelled = false;
    void import('@/lib/offline_bootstrap').then(({ whenHomeBootstrapReady }) => {
      whenHomeBootstrapReady(
        () => {
          if (cancelled) return;
          router.prefetch('/reader');
          window.setTimeout(() => {
            if (cancelled) return;
            void import('@/components/tabs/AssistantTab');
            void import('@/components/tabs/DiscoverTab');
            router.prefetch('/assistant');
            router.prefetch('/discover');
            router.prefetch('/profile');
          }, 4_000);
        },
        { afterMs: 10_000, fallbackMs: 30_000 },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const go = (href: string) => {
    if (href === '/reader') markReaderTabEntry();
    if (pathname === href) {
      if (href === '/reader') dispatchReaderToggleChrome();
      return;
    }
    if (isTabKeepAliveEnabled() && isPwaMainTabHref(href)) {
      navigatePwaTab(href);
      return;
    }
    router.push(href);
  };

  if (onShareLanding) return null;
  // Flutter 安卓壳外层已有原生五 Tab，内嵌不再挂 Web 底栏
  if (isFlutterH5Host()) return null;

  return (
    <nav
      className={`tabbar${compact ? ' tabbar-compact-nav' : ''}`}
      aria-label="主导航"
      onContextMenu={(e) => e.preventDefault()}
    >
      {TABS.map((t) => {
        const active =
          t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
        const needsNet = (t.href === '/discover' || t.href === '/assistant') && !online;
        return (
          <button
            key={t.href}
            type="button"
            className={`tab ${active ? 'tab-active' : ''}${needsNet ? ' tab-offline-hint' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={needsNet ? `${t.label}，当前离线需联网` : t.label}
            title={needsNet ? '当前离线，此功能需联网' : undefined}
            onContextMenu={(e) => e.preventDefault()}
            {...shellTapProps({
              onTap: () => go(t.href),
              blurOnClick: true,
            })}
          >
            <span className="tab-icon-wrap" aria-hidden>
              <svg
                className="tab-icon tab-icon-outline"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d={t.outline} />
              </svg>
              <svg
                className="tab-icon tab-icon-filled"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d={t.filled} />
              </svg>
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function useRouterPathname(): string {
  const routerPath = usePathname();
  const keepAlive = isTabKeepAliveEnabled();
  const pwaPath = useSyncExternalStore(
    subscribePwaTabNav,
    getPwaTabPathname,
    () => '/',
  );
  return keepAlive ? resolvePwaShellPathname(routerPath, pwaPath) : normalizeAppPath(routerPath);
}
