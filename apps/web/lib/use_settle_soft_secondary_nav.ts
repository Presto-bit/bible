'use client';

import { useEffect } from 'react';
import { settleSoftSecondaryNav } from '@/lib/pwa_tab_nav';

/** 二级页挂载时收 soft-nav pending/进度，避免顶栏残留挡点击 */
export function useSettleSoftSecondaryNav(): void {
  useEffect(() => {
    settleSoftSecondaryNav();
  }, []);
}
