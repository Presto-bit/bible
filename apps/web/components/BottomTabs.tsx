'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markReaderTabEntry } from '@/lib/reading';
import { isStandalonePwa } from '@/lib/platform';

// 图标与 App（Material Icons）保持一致：home / menu_book / auto_awesome / explore / person。
// outline 为未选中态，filled 为选中态（与 App 的 NavigationDestination 行为一致）。
const TABS = [
  {
    href: '/',
    label: '首页',
    outline:
      'M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z',
    filled: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  },
  {
    href: '/reader',
    label: '圣经',
    outline:
      'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z',
    filled:
      'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5v14c1.45-.9 3.55-1.5 5.5-1.5 1.95 0 4.05.4 5.5 1.5V6.5c-.5-.4-1.1-.66-1.5-.99V19c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V6c-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z',
  },
  {
    href: '/assistant',
    label: '小爱',
    outline:
      'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z',
    filled:
      'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z',
  },
  {
    href: '/discover',
    label: '发现',
    outline:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2.19-5.81L6 18l3.81-8.19L18 6l-3.81 8.19zM12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1 1.1-.49 1.1-1.1-.49-1.1-1.1-1.1z',
    filled:
      'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z',
  },
  {
    href: '/profile',
    label: '我的',
    outline:
      'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 8c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zm-6 4c.22-.72 3.31-2 6-2 2.7 0 5.8 1.29 6 2H6z',
    filled:
      'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
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
  '/friend/add',
  '/profile/reminders',
  '/profile/appearance',
  '/admin',
  '/discover/groups',
  '/group/create',
];

const GROUP_COMPACT_RE = /^\/discover\/(group\/|join)/;

/** 底部 Tab：用 button 导航，避免 PWA/Safari 长按链接弹出预览与共享 */
export default function BottomTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const compact =
    SECONDARY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    || GROUP_COMPACT_RE.test(pathname);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>('.tabbar');
    if (!bar) return;
    if (compact) return;
    bar.style.removeProperty('transform');
    bar.style.pointerEvents = '';
  }, [compact, pathname]);

  useEffect(() => {
    if (!isStandalonePwa()) return;
    for (const href of ['/', '/reader', '/assistant', '/discover', '/profile']) {
      router.prefetch(href);
    }
  }, [router]);

  const go = (href: string) => {
    if (href === '/reader') markReaderTabEntry();
    if (pathname === href) return;
    router.push(href);
  };

  return (
    <nav
      className={`tabbar${compact ? ' tabbar-compact-nav' : ''}`}
      aria-label="主导航"
      onContextMenu={(e) => e.preventDefault()}
    >
      {TABS.map((t) => {
        const active =
          t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
        return (
          <button
            key={t.href}
            type="button"
            className={`tab ${active ? 'tab-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={t.label}
            onClick={() => go(t.href)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={active ? t.filled : t.outline} />
            </svg>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
