'use client';

import { useEffect } from 'react';
import { settleSoftSecondaryNav } from '@/lib/pwa_tab_nav';
import {
  clearStrandedBodyTouchLocks,
  dismissOrphanBodySheetBackdrops,
  hardRemoveBlockingOverlays,
} from '@/lib/sheet_overlay';

/** 二级页挂载时收 soft-nav pending/进度，并清僵尸遮罩（对齐设置页） */
export function useSettleSoftSecondaryNav(): void {
  useEffect(() => {
    settleSoftSecondaryNav();
    dismissOrphanBodySheetBackdrops();
    hardRemoveBlockingOverlays();
    clearStrandedBodyTouchLocks({ forceExternal: false });
  }, []);
}
