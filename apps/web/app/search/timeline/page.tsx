'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type TimelineTour } from '@/lib/api';
import { TimelineTourPanels } from '@/components/search/StoryTourPanels';

export default function SearchTimelineStoriesPage() {
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
      <div className="section-row" style={{ marginTop: 0 }}>
        <Link href="/search" className="muted">‹ 搜索</Link>
        <strong>时间故事</strong>
        <span />
      </div>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
        圣经历史时间线专题，点开卡片查看节点与经文。
      </p>
      <div style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : <TimelineTourPanels tours={tours} />}
      </div>
    </main>
  );
}
