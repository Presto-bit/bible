'use client';

import { useSettleSoftSecondaryNav } from '@/lib/use_settle_soft_secondary_nav';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { NotesPageContent } from '@/components/notes/NotesPageContent';

export default function NotesPage() {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return <NotesPageSettled />;
}

/** 真路由到达：收 soft-nav + 清遮罩 */
function NotesPageSettled() {
  useSettleSoftSecondaryNav();
  return <NotesPageContent />;
}
