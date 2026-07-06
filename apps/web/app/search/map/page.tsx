'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type MapTour } from '@/lib/api';
import { mapStoryHref } from '@/lib/topic_routes';

export default function SearchMapIndexPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [tours, setTours] = useState<MapTour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .mapTours()
      .then((d) => setTours(d.tours ?? []))
      .catch(() => setTours([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">地图故事</h2>
      </header>
      <p className="muted story-mode-sub">
        选一条路线，按站点顺序读经。
      </p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : null}
        {!loading && tours.length === 0 ? <p className="muted">暂无地图专题</p> : null}
        {tours.map((tour) => (
          <Link
            key={tour.id}
            href={mapStoryHref(tour.id)}
            className="card card-2 topic-picker-card"
          >
            <span className="story-tour-badge">地图故事</span>
            <strong className="story-tour-title">{tour.title}</strong>
            <p className="muted story-tour-meta">
              {[tour.era, tour.subtitle, `${tour.stops?.length ?? 0} 站`].filter(Boolean).join(' · ')}
            </p>
            <span className="story-tour-toggle">开始游览 ›</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
