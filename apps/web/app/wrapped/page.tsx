'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildTrackedUrl } from '@/lib/acquisition';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { shareCardOutbound } from '@/lib/share_card';
import { buildWrapped } from '@/lib/wrapped';

function WrappedInner() {
  useEdgeSwipeBack({ href: '/report' });
  const sp = useSearchParams();
  const period = sp.get('period') === 'year' ? 'year' : 'month';
  const w = buildWrapped(period);
  const [hint, setHint] = useState<string | null>(null);

  const share = async () => {
    setHint(null);
    const stats =
      `活跃 ${w.activeDays} 天 · 阅读 ${w.totalMinutes} 分钟 · 连续 ${w.streak} 天 · 笔记 ${w.notesCount} 条 · 划线 ${w.marksCount} 处`;
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
    const result = await shareCardOutbound({
      title: w.highlight,
      subtitle: w.label,
      body: stats,
      footer: `${BRAND_NAME} · ${BRAND_TAGLINE}`,
      badge: '读经回顾',
      day: period === 'year' ? 21 : 14,
      shareTitle: `${w.label}｜${BRAND_NAME}`,
      shareText: `${w.label}\n${w.highlight}\n${stats}\n打开链接看看我的读经足迹`,
      shareUrl: url,
      allowDownload: false,
    });
    if (result === 'copied') setHint('已复制文案与链接');
    if (result === 'cancelled') setHint(null);
    if (result === 'failed') setHint('分享失败，请重试');
  };

  return (
    <main className="container wrapped-page">
      <header className="page-head">
        <PageBackBar href="/report" label="读经回顾" />
        <div className="page-head-spacer" />
        <div className="wrapped-tabs">
          <Link href="/wrapped?period=month" className={period === 'month' ? 'active' : ''}>本月</Link>
          <Link href="/wrapped?period=year" className={period === 'year' ? 'active' : ''}>今年</Link>
        </div>
      </header>
      <div className="wrapped-hero card card-tint card-2">
        <p className="muted">{w.label}</p>
        <h1 style={{ fontSize: 26, margin: '8px 0' }}>{w.highlight}</h1>
        <div className="wrapped-stats">
          <div><strong>{w.activeDays}</strong><span>活跃天</span></div>
          <div><strong>{w.totalMinutes}</strong><span>阅读分钟</span></div>
          <div><strong>{w.streak}</strong><span>连续天</span></div>
          <div><strong>{w.notesCount}</strong><span>笔记</span></div>
          <div><strong>{w.marksCount}</strong><span>划线</span></div>
        </div>
        <button type="button" className="btn" onClick={() => void share()}>
          分享回顾
        </button>
        {hint ? <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>{hint}</p> : null}
      </div>
    </main>
  );
}

export default function WrappedPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <WrappedInner />
    </Suspense>
  );
}
