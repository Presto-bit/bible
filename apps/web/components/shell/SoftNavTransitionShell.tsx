'use client';

import { useEffect, useState } from 'react';
import {
  getPendingSecondaryTarget,
  settleSoftSecondaryNav,
  subscribePwaTabNav,
} from '@/lib/pwa_tab_nav';
import {
  subscribeSoftNavFail,
  subscribeSoftNavProgress,
} from '@/lib/soft_nav_progress';

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

/**
 * 二级 soft-nav 乐观过渡：轻量壳（不挡点击、非全屏蒙层）。
 * pending 期间 suppressRoute 仍为 true，靠本壳给「点了就有画面」。
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
    const unsubFail = subscribeSoftNavFail(() => {
      settleSoftSecondaryNav();
      setHref(null);
    });
    const unsubTab = subscribePwaTabNav(sync);
    return () => {
      unsubProg();
      unsubFail();
      unsubTab();
    };
  }, []);

  if (!href) return null;

  const title = titleForHref(href);

  return (
    <div
      className="soft-nav-transition-shell"
      aria-busy="true"
      aria-live="polite"
      // 不挡下方返回 / 勿做成全屏 pointer 锁
    >
      <div className="soft-nav-transition-inner">
        <p className="soft-nav-transition-title">{title}</p>
        <p className="muted soft-nav-transition-sub">正在打开…</p>
        <div className="tab-skel-block tab-skel-hero soft-nav-transition-skel" />
        <div className="tab-skel-block soft-nav-transition-skel" />
      </div>
    </div>
  );
}
