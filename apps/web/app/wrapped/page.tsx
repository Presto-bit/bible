'use client';

import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildWrapped } from '@/lib/wrapped';
import { shareCard } from '@/lib/share_card';
import { BRAND_NAME } from '@/lib/brand';

function WrappedInner() {
  useEdgeSwipeBack({ href: '/report' });
  const sp = useSearchParams();
  const period = sp.get('period') === 'year' ? 'year' : 'month';
  const w = buildWrapped(period);

  const share = async () => {
    const ok = await shareCard({
      title: w.highlight,
      subtitle: w.label,
      body: `活跃 ${w.activeDays} 天 · 阅读 ${w.totalMinutes} 分钟 · 连续 ${w.streak} 天 · 笔记 ${w.notesCount} 条 · 划线 ${w.marksCount} 处`,
      footer: BRAND_NAME,
    });
    if (!ok) {
      const text = `${w.label}\n${w.highlight}\n活跃 ${w.activeDays} 天 · 阅读 ${w.totalMinutes} 分钟`;
      await navigator.clipboard.writeText(text);
    }
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
