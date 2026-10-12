'use client';

import { Suspense } from 'react';
import DiscoverHub from '@/components/discover/DiscoverHub';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { DiscoverTabSkeleton } from '@/components/social/ImThreadSkeleton';

function DiscoverPageInner() {
  if (useSuppressKeepAliveRoute()) return null;
  return <DiscoverHub />;
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<DiscoverTabSkeleton />}>
      <DiscoverPageInner />
    </Suspense>
  );
}
