'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import WrappedStory from '@/components/wrapped/WrappedStory';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildTrackedUrl } from '@/lib/acquisition';
import { BRAND_NAME } from '@/lib/brand';
import { shareOutbound } from '@/lib/share_outbound';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import {
  buildWrapped,
  enrichWrappedTexts,
  wrappedShareStatsLine,
  wrappedShareText,
  type WrappedPeriod,
  type WrappedStats,
} from '@/lib/wrapped';
import { renderWrappedSharePng } from '@/lib/wrapped_share';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';

function WrappedInner() {
  useEdgeSwipeBack({ href: '/report' });
  const sp = useSearchParams();
  const period: WrappedPeriod = sp.get('period') === 'year' ? 'year' : 'month';
  const [w, setW] = useState<WrappedStats | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // 延迟重算：先让路由切页动画/layout 落定，避免安卓壳首屏卡死
  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    const run = () => {
      if (cancelled) return;
      const base = buildWrapped(period);
      if (cancelled) return;
      setW(base);
      void enrichWrappedTexts(base).then((enriched) => {
        if (!cancelled) setW(enriched);
      });
    };
    const timer = window.setTimeout(() => {
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === 'function') {
        idleId = ric(run, { timeout: 220 });
      } else {
        run();
      }
    }, isPeiaiAndroidShell() ? 80 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleId != null) {
        const cic = (
          window as Window & { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback;
        cic?.(idleId);
      }
    };
  }, [period]);

  useEffect(() => {
    document.documentElement.classList.add('wrapped-open');
    document.body.classList.add('wrapped-open');
    return () => {
      document.documentElement.classList.remove('wrapped-open');
      document.body.classList.remove('wrapped-open');
    };
  }, []);

  const share = async () => {
    if (!w) return;
    setHint(null);
    setSharing(true);
    try {
      const stats = wrappedShareStatsLine(w);
      const q = new URLSearchParams({
        period,
        label: w.label,
        h: w.highlight.slice(0, 80),
        s: stats.slice(0, 120),
      });
      if (w.yearVerse?.text) q.set('vt', w.yearVerse.text.slice(0, 160));
      if (w.yearVerse?.label) q.set('vl', w.yearVerse.label.slice(0, 40));
      if (w.topBookName) q.set('b', w.topBookName.slice(0, 24));
      if (w.daypartLabel) q.set('dp', w.daypartLabel.slice(0, 8));
      const url = buildTrackedUrl(`/share/wrapped?${q.toString()}`, {
        l1: 'share',
        l2: 'system_share',
        l3: `wrapped:${period}`,
      });
      const blob = await renderWrappedSharePng(w);
      const file = blob
        ? new File([blob], `beiai-wrapped-${period}.png`, { type: 'image/png' })
        : null;
      const result = await shareOutbound({
        title: `${w.label}｜${BRAND_NAME}`,
        text: `${wrappedShareText(w)}\n打开链接看看我的读经足迹`,
        url,
        file,
        allowDownload: true,
      });
      if (result === 'copied') setHint('已复制文案与链接');
      if (result === 'downloaded') setHint('已保存分享图');
      if (result === 'shared') setHint('已分享');
      if (result === 'cancelled') setHint(null);
      if (result === 'failed') setHint('分享失败，请重试');
    } finally {
      setSharing(false);
    }
  };

  return (
    <main className="wrapped-page-shell">
      <header className="wrapped-page-head">
        <PageBackBar href="/report" label="读经回顾" onClick={() => markRouteNavigation()} />
        <div className="wrapped-tabs">
          <Link
            href="/wrapped?period=month"
            className={period === 'month' ? 'active' : ''}
            onClick={() => markRouteNavigation()}
          >
            本月
          </Link>
          <Link
            href="/wrapped?period=year"
            className={period === 'year' ? 'active' : ''}
            onClick={() => markRouteNavigation()}
          >
            今年
          </Link>
        </div>
      </header>
      {w ? (
        <WrappedStory
          stats={w}
          onShare={() => void share()}
          shareHint={hint}
          sharing={sharing}
        />
      ) : (
        <div className="wrapped-story-loading" aria-busy="true">
          <p className="muted">正在整理你的足迹…</p>
        </div>
      )}
    </main>
  );
}

export default function WrappedPage() {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;

  return (
    <Suspense
      fallback={
        <main className="container">
          <p className="muted">加载中…</p>
        </main>
      }
    >
      <WrappedInner />
    </Suspense>
  );
}
