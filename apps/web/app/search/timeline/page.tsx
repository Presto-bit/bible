'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageBackBar from '@/components/PageBackBar';
import { TopicNavCard } from '@/components/search/TopicNavCard';
import { KnowledgeTopicCardBody } from '@/components/search/KnowledgeTopicCardBody';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type TimelineTour } from '@/lib/api';
import { timelineStoryHref } from '@/lib/topic_routes';
import {
  EXODUS_SERIES,
  knowledgeCountMeta,
  knowledgeKindCta,
  knowledgeListLead,
  seriesStepHref,
  tourHook,
} from '@/lib/knowledge_story';
import {
  getKnowledgeProgress,
  knowledgeProgressLabel,
} from '@/lib/knowledge_progress';

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
      <p className="muted story-mode-sub">{knowledgeListLead('timeline')}</p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">正在载入…</p> : null}
        {!loading && tours.length === 0 ? (
          <p className="muted knowledge-empty">
            暂无时间线专题。
            <Link href={seriesStepHref(EXODUS_SERIES.steps[0])} className="text-link">
              {' '}先走出埃及故事 ›
            </Link>
          </p>
        ) : null}
        {tours.map((tour) => {
          const n = tour.events?.length ?? 0;
          const row = getKnowledgeProgress('timeline', tour.id);
          const progress =
            row && (row.completed || row.step > 0)
              ? knowledgeProgressLabel(row, '个节点')
              : null;
          return (
            <TopicNavCard
              key={tour.id}
              href={timelineStoryHref(tour.id)}
              className="card card-2 topic-picker-card"
              ariaLabel={tour.title}
            >
              <KnowledgeTopicCardBody
                badge="时间故事"
                badgeClassName="story-tour-badge-time"
                title={tour.title}
                hook={tourHook(tour.id) || tour.subtitle}
                meta={knowledgeCountMeta(n, 'timeline')}
                progress={progress}
                cta={
                  progress && !row?.completed
                    ? '继续走 ›'
                    : knowledgeKindCta('timeline')
                }
              />
            </TopicNavCard>
          );
        })}
      </div>
    </main>
  );
}
