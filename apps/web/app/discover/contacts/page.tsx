'use client';

import PageBackBar from '@/components/PageBackBar';
import DiscoverContactsPane from '@/components/discover/DiscoverContactsPane';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function DiscoverContactsPage() {
  useEdgeSwipeBack({ href: '/discover' });

  return (
    <main className="container discover-page discover-im">
      <header className="page-head" style={{ marginBottom: 8 }}>
        <PageBackBar href="/discover" label="消息" />
        <h2 className="page-head-title">通讯录</h2>
      </header>
      <DiscoverContactsPane />
    </main>
  );
}
