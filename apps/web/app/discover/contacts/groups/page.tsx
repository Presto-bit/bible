'use client';

import PageBackBar from '@/components/PageBackBar';
import DiscoverContactsGroupsPane from '@/components/discover/DiscoverContactsGroupsPane';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function DiscoverContactsGroupsPage() {
  useEdgeSwipeBack({ href: '/discover/contacts' });

  return (
    <main className="container discover-page discover-im">
      <header className="page-head" style={{ marginBottom: 8 }}>
        <PageBackBar href="/discover/contacts" label="通讯录" />
        <h2 className="page-head-title">我的群</h2>
      </header>
      <DiscoverContactsGroupsPane />
    </main>
  );
}
