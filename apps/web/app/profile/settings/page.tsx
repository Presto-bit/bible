'use client';

import { useEffect } from 'react';
import PageBackBar from '@/components/PageBackBar';
import ProfileSettingsPanel from '@/components/profile/ProfileSettingsPanel';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function ProfileSettingsPage() {
  useEdgeSwipeBack({ href: '/profile' });

  // 进设置即锁定 route 源，避免确认框叠在旧的发现 Tab 保活层上
  useEffect(() => {
    markRouteNavigation();
  }, []);

  return (
    <main className="container profile-settings-page">
      <header className="page-head">
        <PageBackBar
          href="/profile"
          label="我的"
          onClick={() => markRouteNavigation()}
        />
        <h2 className="page-head-title">设置</h2>
      </header>
      <ProfileSettingsPanel />
    </main>
  );
}
