'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import {
  getPendingSecondaryTarget,
  markRouteNavigation,
  navigatePwaTab,
  settleSoftSecondaryNav,
  subscribePwaTabNav,
} from '@/lib/pwa_tab_nav';
import {
  subscribeSoftNavProgress,
} from '@/lib/soft_nav_progress';

const ProfileSettingsPanel = dynamic(
  () => import('@/components/profile/ProfileSettingsPanel'),
  { ssr: false },
);
const NotesPageContent = dynamic(
  () => import('@/app/notes/page').then((m) => m.NotesPageContent),
  { ssr: false },
);
const ShelfListContent = dynamic(
  () => import('@/app/shelf/page').then((m) => m.ShelfListContent),
  { ssr: false },
);

function titleForHref(href: string): string {
  const p = href.split('?')[0] ?? href;
  if (p === '/profile/settings' || p.startsWith('/profile/settings/')) return '设置';
  if (p === '/notes' || p.startsWith('/notes/')) return '笔记';
  if (p === '/shelf' || p.startsWith('/shelf/')) return '书架';
  if (p === '/report' || p.startsWith('/report/')) return '本月已读';
  if (p === '/profile/appearance') return '外观';
  if (p === '/profile/reminders') return '提醒与勿扰';
  if (p === '/pray' || p.startsWith('/pray/')) return '祷告';
  return '正在打开…';
}

function liveKind(href: string): 'settings' | 'notes' | 'shelf' | null {
  const p = href.split('?')[0] ?? href;
  if (p === '/profile/settings' || p.startsWith('/profile/settings/')) return 'settings';
  if (p === '/notes' || p.startsWith('/notes/')) return 'notes';
  if (p === '/shelf' || p.startsWith('/shelf/')) return 'shelf';
  return null;
}

function SoftNavBack({ label = '我的' }: { label?: string }) {
  return (
    <PageBackBar
      href="/profile"
      label={label}
      onClick={() => {
        settleSoftSecondaryNav();
        markRouteNavigation();
        navigatePwaTab('/profile');
      }}
    />
  );
}

/**
 * 二级 soft-nav 乐观过渡：设置/笔记/书架直接挂客户端内容（像安卓一点就进）；
 * 其它二级页用轻量壳。壳层可点，避免穿透连点。
 */
export default function SoftNavTransitionShell() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setHref(getPendingSecondaryTarget());
    sync();
    const unsubProg = subscribeSoftNavProgress((d) => {
      if (d.active && d.href) {
        const path = (d.href.split('?')[0] ?? d.href).trim();
        setHref(path.startsWith('/') ? path : `/${path}`);
        return;
      }
      if (!d.active) setHref(getPendingSecondaryTarget());
    });
    const unsubTab = subscribePwaTabNav(sync);
    return () => {
      unsubProg();
      unsubTab();
    };
  }, []);

  if (!href) return null;

  const title = titleForHref(href);
  const live = liveKind(href);

  if (live === 'settings') {
    return (
      <div
        className="soft-nav-transition-shell soft-nav-transition-shell--live"
        aria-busy="true"
        aria-live="polite"
      >
        <main className="container profile-settings-page soft-nav-live-main">
          <header className="page-head">
            <SoftNavBack />
            <h2 className="page-head-title">设置</h2>
          </header>
          <ProfileSettingsPanel />
        </main>
      </div>
    );
  }

  if (live === 'notes') {
    return (
      <div
        className="soft-nav-transition-shell soft-nav-transition-shell--live"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="soft-nav-live-main">
          <NotesPageContent />
        </div>
      </div>
    );
  }

  if (live === 'shelf') {
    return (
      <div
        className="soft-nav-transition-shell soft-nav-transition-shell--live"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="soft-nav-live-main">
          <ShelfListContent />
        </div>
      </div>
    );
  }

  return (
    <div
      className="soft-nav-transition-shell soft-nav-transition-shell--blocking"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="soft-nav-transition-inner">
        <SoftNavBack />
        <p className="soft-nav-transition-title">{title}</p>
        <p className="muted soft-nav-transition-sub">正在打开…</p>
        <div className="tab-skel-block tab-skel-hero soft-nav-transition-skel" />
        <div className="tab-skel-block soft-nav-transition-skel" />
      </div>
    </div>
  );
}
