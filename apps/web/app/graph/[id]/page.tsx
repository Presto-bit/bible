'use client';

import { use } from 'react';
import { EntityGraphPage } from '@/components/knowledge/EntityGraphPage';

export default function GraphEntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <EntityGraphPage entityId={decodeURIComponent(id)} />;
}
