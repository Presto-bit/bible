'use client';

import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import { TopicNavCard } from '@/components/search/TopicNavCard';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';
import { api, type GraphTopic } from '@/lib/api';
import { FEATURED_GRAPH_TOPICS, graphTopicHref } from '@/lib/topic_routes';

export default function SearchGraphIndexPage() {
  useEdgeSwipeBack({ href: '/search' });
  const [topics, setTopics] = useState<GraphTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .graphTopics()
      .then((d) => {
        const list = d.topics ?? [];
        const featured = FEATURED_GRAPH_TOPICS
          .map((id) => list.find((t) => t.id === id))
          .filter((t): t is GraphTopic => Boolean(t));
        setTopics(featured.length ? featured : list.slice(0, 3));
      })
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <PageBackBar href="/search" label="搜索" />
        <h2 className="page-head-title">关系专题</h2>
      </header>
      <p className="muted story-mode-sub">
        人物与地点关系脉络，附经文依据。
      </p>
      <div className="topic-picker-list" style={{ marginTop: 14 }}>
        {loading ? <p className="muted">加载中…</p> : null}
        {!loading && topics.length === 0 ? <p className="muted">暂无关系专题</p> : null}
        {topics.map((t) => (
          <TopicNavCard
            key={t.id}
            href={graphTopicHref(t.id)}
            className="card card-2 topic-picker-card"
            ariaLabel={t.title}
          >
            <span className="story-tour-badge story-tour-badge-graph">关系专题</span>
            <strong className="story-tour-title">{t.title}</strong>
            {t.subtitle ? (
              <p className="muted story-tour-meta">{t.subtitle}</p>
            ) : null}
            <span className="story-tour-toggle">查看专题 ›</span>
          </TopicNavCard>
        ))}
      </div>
    </main>
  );
}
