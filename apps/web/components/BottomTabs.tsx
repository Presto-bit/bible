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
 * 五 Tab 自绘图标（24×24）：线框 ↔ 实心。
 * 隐喻：今日=家 / 圣经=摊开书+脊+页线 / 小爱=单泡+心点 / 发现=探索罗盘 / 我的=头肩。
 * 含镂空的 path 用 evenodd。
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
    // 摊开书：页框 evenodd 镂空 + 书脊 + 页线
    outline:
      'M3.9 6.15c1.85-.75 4.05-1.15 6.35-1.05.3.02.7.05.95.1v12.7c-.3-.06-.65-.1-1-.1-2.05 0-4.1.4-5.85.95-.45.15-.9-.2-.9-.68V6.9c0-.35.2-.65.45-.75zm1.45 1.55v8.35c1.35-.4 2.9-.65 4.4-.65.2 0 .4 0 .6.02V7.55c-.2-.03-.4-.05-.65-.05-1.55-.05-3.05.2-4.35.7zm14.75-1.55c-.25.1-.45.4-.45.75v10.67c0 .48-.45.83-.9.68-1.75-.55-3.8-.95-5.85-.95-.35 0-.7.04-1 .1V5.2c.25-.05.65-.08.95-.1 2.3-.1 4.5.3 6.35 1.05zm-1.45 1.55c-1.3-.5-2.8-.75-4.35-.7-.25 0-.45.02-.65.05v7.87c.2-.02.4-.02.6-.02 1.5 0 3.05.25 4.4.65V7.7zM11.2 4.45h1.6v15.1h-1.6V4.45zM6.35 9.4h2.9v1.05h-2.9V9.4zm0 2.45h2.2v1.05h-2.2v-1.05zm8.4-2.45h2.9v1.05h-2.9V9.4zm.7 2.45h2.2v1.05h-2.2v-1.05z',
    filled:
      'M4 5.9c1.9-.8 4.2-1.2 6.55-1.05.35.02.8.06 1.1.12v12.95c-.35-.08-.75-.12-1.15-.12-2.15 0-4.35.4-6.2 1-.5.17-1-.22-1-.75V6.7c0-.4.23-.74.5-.85.07-.02.13-.03.2-.03zm8.35-.08c.3-.06.75-.1 1.1-.12 2.35-.15 4.65.25 6.55 1.05.27.11.5.45.5.85v10.35c0 .53-.5.92-1 .75-1.85-.6-4.05-1-6.2-1-.4 0-.8.04-1.15.12V5.82zM11.05 4.35h1.9v15.5h-1.9V4.35z',
  },
  {
    href: '/assistant',
    label: '小爱',
    // 单对话泡 + 心点（线框：环+心；实心：挖空心）
    outline:
      'M5.8 5.2h12.4A2.8 2.8 0 0121 8v7.1a2.8 2.8 0 01-2.8 2.8h-4.35l-3.15 2.65a.7.7 0 01-1.15-.54v-2.11H5.8A2.8 2.8 0 013 15.1V8a2.8 2.8 0 012.8-2.8zm0 1.5A1.3 1.3 0 004.5 8v7.1c0 .72.58 1.3 1.3 1.3h3.05v1.85l2.2-1.85h6.15c.72 0 1.3-.58 1.3-1.3V8c0-.72-.58-1.3-1.3-1.3H5.8zm6.2 2.15c-.42 0-.8.2-1.05.55-.25-.35-.63-.55-1.05-.55-.72 0-1.3.55-1.3 1.28 0 .95 1 1.78 2.35 2.95 1.35-1.17 2.35-2 2.35-2.95 0-.73-.58-1.28-1.3-1.28z',
    filled:
      'M5.8 4.9h12.4A3.1 3.1 0 0121.3 8v7.1a3.1 3.1 0 01-3.1 3.1h-4.05l-3.45 2.9a.85.85 0 01-1.4-.66v-2.24H5.8A3.1 3.1 0 012.7 15.1V8A3.1 3.1 0 015.8 4.9zm6.2 3.55c.85 0 1.55.68 1.55 1.55 0 1.15-1.15 2.1-2.75 3.4-1.6-1.3-2.75-2.25-2.75-3.4 0-.87.7-1.55 1.55-1.55.48 0 .92.22 1.2.6.28-.38.72-.6 1.2-.6z',
  },
  {
    href: '/discover',
    label: '发现',
    // 探索罗盘：外环 + 斜向指针 + 中心点
    outline:
      'M12 3.2a8.8 8.8 0 100 17.6 8.8 8.8 0 000-17.6zm0 1.55a7.25 7.25 0 110 14.5 7.25 7.25 0 010-14.5zm2.35 3.35l-5.55 2.45-2.45 5.55 5.55-2.45 2.45-5.55zm-2.35 3.7a1.05 1.05 0 100 2.1 1.05 1.05 0 000-2.1z',
    filled:
      'M12 2.8a9.2 9.2 0 100 18.4 9.2 9.2 0 000-18.4zm2.55 5.05l-2.55 5.75-5.75 2.55 2.55-5.75 5.75-2.55zM12 11a1.05 1.05 0 100 2.1A1.05 1.05 0 0012 11z',
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
                <path fillRule="evenodd" d={t.outline} />
              </svg>
              <svg
                className="tab-icon tab-icon-filled"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path fillRule="evenodd" d={t.filled} />
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
