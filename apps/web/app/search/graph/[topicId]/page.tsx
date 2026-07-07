'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { GraphTopicView } from '@/components/search/GraphTopicView';

function GraphTopicPageContent() {
  const params = useParams();
  const topicId = decodeURIComponent(String(params.topicId || ''));

  return (
    <main className="container story-mode-page entity-graph-page">
      <GraphTopicView topicId={topicId} backHref="/search/graph" backLabel="关系专题" />
    </main>
  );
}

export default function GraphTopicPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <GraphTopicPageContent />
    </Suspense>
  );
}
