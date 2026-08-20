'use client';

import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { EntityKnowledgePage } from '@/components/knowledge/EntityKnowledgePage';
import type { EntityKnowledgeFrom } from '@/lib/entity_knowledge';

function DictionaryEntityInner({ id }: { id: string }) {
  const sp = useSearchParams();
  const from = (sp.get('from') ?? undefined) as EntityKnowledgeFrom | undefined;
  return (
    <EntityKnowledgePage
      entityId={id}
      backHref="/dictionary"
      backLabel="词典"
      from={from}
    />
  );
}

export default function DictionaryEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <DictionaryEntityInner id={decodeURIComponent(id)} />
    </Suspense>
  );
}
