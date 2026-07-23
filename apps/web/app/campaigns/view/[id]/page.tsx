'use client';

import { Suspense } from 'react';
import CampaignViewInner from './view_inner';

export default function CampaignViewPage() {
  return (
    <Suspense fallback={<main className="container"><p className="muted">加载中…</p></main>}>
      <CampaignViewInner />
    </Suspense>
  );
}
