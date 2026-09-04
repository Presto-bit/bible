'use client';

import { useEffect } from 'react';
import PageBackBar from '@/components/PageBackBar';
import ProfileSettingsPanel from '@/components/profile/ProfileSettingsPanel';
import { markRouteNavigation, settleSoftSecondaryNav } from '@/lib/pwa_tab_nav';
import {
  clearStrandedBodyTouchLocks,
  dismissOrphanBodySheetBackdrops,
  hardRemoveBlockingOverlays,
} from '@/lib/sheet_overlay';
import { useEdgeSwipeBack } from '@/lib/use_edge_swipe_back';

export default function ProfileSettingsPage() {
  useEdgeSwipeBack({ href: '/profile' });

  // 进设置：锁定 route、收 soft-nav、清僵尸遮罩，避免顶栏进度/旧 overlay 挡点击
  useEffect(() => {
    markRouteNavigation();
    settleSoftSecondaryNav();
    dismissOrphanBodySheetBackdrops();
    hardRemoveBlockingOverlays();
    clearStrandedBodyTouchLocks({ forceExternal: false });
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
