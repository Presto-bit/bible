'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import WrappedStory from '@/components/wrapped/WrappedStory';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense, useEffect, useMemo, useState } from 'react';
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
  type WrappedShareTemplate,
  type WrappedStats,
} from '@/lib/wrapped';
import { renderWrappedSharePng } from '@/lib/wrapped_share';

function WrappedInner() {
  useEdgeSwipeBack({ href: '/report' });
  const sp = useSearchParams();
  const period = sp.get('period') === 'year' ? 'year' : 'month';
  const base = useMemo(() => buildWrapped(period), [period]);
  const [w, setW] = useState<WrappedStats>(base);
  const [hint, setHint] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setW(base);
    let cancelled = false;
    void enrichWrappedTexts(base).then((enriched) => {
      if (!cancelled) setW(enriched);
    });
    return () => {
      cancelled = true;
    };
  }, [base]);

  const share = async (template: WrappedShareTemplate) => {
    setHint(null);
    setSharing(true);
    try {
      const stats = wrappedShareStatsLine(w);
      const q = new URLSearchParams({
        period,
        label: w.label,
        h: (w.yearVerse?.label || w.highlight).slice(0, 64),
        s: stats.slice(0, 120),
        t: template,
      });
      if (w.yearVerse?.text) q.set('vt', w.yearVerse.text.slice(0, 120));
      if (w.yearVerse?.label) q.set('vl', w.yearVerse.label.slice(0, 40));
      if (w.topBookName) q.set('b', w.topBookName.slice(0, 24));
      const url = buildTrackedUrl(`/share/wrapped?${q.toString()}`, {
        l1: 'share',
        l2: 'system_share',
        l3: `wrapped:${period}:${template}`,
      });
      const blob = await renderWrappedSharePng(w, template);
      const file = blob
        ? new File([blob], `beiai-wrapped-${period}-${template}.png`, { type: 'image/png' })
        : null;
      const result = await shareOutbound({
        title: `${w.label}｜${BRAND_NAME}`,
        text: `${wrappedShareText(w, template)}\n打开链接看看我的读经足迹`,
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
      <WrappedStory
        stats={w}
        onShare={(t) => void share(t)}
        shareHint={hint}
        sharing={sharing}
      />
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
