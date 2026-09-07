'use client';

import { useSettleSoftSecondaryNav } from '@/lib/use_settle_soft_secondary_nav';
import { useSuppressKeepAliveRoute } from '@/components/shell/TabKeepAliveContext';
import { ShelfListContent } from '@/components/shelf/ShelfListContent';

export default function ShelfPage() {
  const suppress = useSuppressKeepAliveRoute();
  if (suppress) return null;
  return <ShelfPageSettled />;
}

/** 真路由到达：收 soft-nav + 清遮罩 */
function ShelfPageSettled() {
  useSettleSoftSecondaryNav();
  return <ShelfListContent />;
}
