'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type TimelineTour } from '@/lib/api';
import { TimelineTourPanels } from '@/components/search/StoryTourPanels';

export default function SearchTimelineStoriesPage() {
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
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        圣经历史时间线专题，点开卡片查看节点与经文。
      </p>
      <div style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : <TimelineTourPanels tours={tours} />}
      </div>
    </main>
  );
}
