'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import WrappedStory from '@/components/wrapped/WrappedStory';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildTrackedUrl } from '@/lib/acquisition';
import { BRAND_NAME } from '@/lib/brand';
import { shareOutbound } from '@/lib/share_outbound';
import {
  buildWrapped,
  wrappedShareStatsLine,
  wrappedShareText,
} from '@/lib/wrapped';
import { renderWrappedSharePng } from '@/lib/wrapped_share';

function WrappedInner() {
  useEdgeSwipeBack({ href: '/report' });
  const sp = useSearchParams();
  const period = sp.get('period') === 'year' ? 'year' : 'month';
  const w = useMemo(() => buildWrapped(period), [period]);
  const [hint, setHint] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    setHint(null);
    setSharing(true);
    try {
      const stats = wrappedShareStatsLine(w);
      const q = new URLSearchParams({
        period,
        label: w.label,
        h: w.highlight.slice(0, 64),
        s: stats.slice(0, 120),
      });
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
        <PageBackBar href="/report" label="读经回顾" />
        <div className="wrapped-tabs">
          <Link href="/wrapped?period=month" className={period === 'month' ? 'active' : ''}>
            本月
          </Link>
          <Link href="/wrapped?period=year" className={period === 'year' ? 'active' : ''}>
            今年
          </Link>
        </div>
      </header>
      <WrappedStory
        stats={w}
        onShare={() => void share()}
        shareHint={hint}
        sharing={sharing}
      />
    </main>
  );
}

export default function WrappedPage() {
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
