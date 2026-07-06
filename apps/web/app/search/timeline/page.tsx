'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type TimelineTour } from '@/lib/api';
import { timelineStoryHref } from '@/lib/topic_routes';

export default function SearchTimelineIndexPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [tours, setTours] = useState<TimelineTour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .timelineTours()
      .then((d) => setTours(d.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">时间故事</h2>
      </header>
      <p className="muted story-mode-sub">
        按历史节点顺序读经。
      </p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : null}
        {!loading && tours.length === 0 ? <p className="muted">暂无时间线专题</p> : null}
        {tours.map((tour) => (
          <Link
            key={tour.id}
            href={timelineStoryHref(tour.id)}
            className="card card-2 topic-picker-card"
          >
            <span className="story-tour-badge story-tour-badge-time">时间故事</span>
            <strong className="story-tour-title">{tour.title}</strong>
            <p className="muted story-tour-meta">
              {[tour.subtitle, `${tour.events?.length ?? 0} 个节点`].filter(Boolean).join(' · ')}
            </p>
            <span className="story-tour-toggle">开始游览 ›</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
