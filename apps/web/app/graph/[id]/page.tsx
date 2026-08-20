'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { EntityGraphPage } from '@/components/knowledge/EntityGraphPage';
import type { EntityKnowledgeFrom } from '@/lib/entity_knowledge';

function GraphEntityInner({ id }: { id: string }) {
  const sp = useSearchParams();
  const from = (sp.get('from') ?? undefined) as EntityKnowledgeFrom | undefined;
  return <EntityGraphPage entityId={id} from={from} />;
}

export default function GraphEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <GraphEntityInner id={decodeURIComponent(id)} />
    </Suspense>
  );
}
