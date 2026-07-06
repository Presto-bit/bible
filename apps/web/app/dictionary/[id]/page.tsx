'use client';

import { use } from 'react';
import { EntityKnowledgePage } from '@/components/knowledge/EntityKnowledgePage';

export default function DictionaryEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <EntityKnowledgePage
      entityId={decodeURIComponent(id)}
      backHref="/dictionary"
      backLabel="词典"
    />
  );
}
