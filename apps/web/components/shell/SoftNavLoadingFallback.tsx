'use client';

import { useEffect } from 'react';
import { settleSoftSecondaryNav } from '@/lib/pwa_tab_nav';

/** 二级页 loading：轻文案；卸下时收 soft-nav，避免进度条残留 */
export default function SoftNavLoadingFallback() {
  useEffect(() => {
    return () => {
      settleSoftSecondaryNav();
    };
  }, []);

  return (
    <main className="container soft-nav-loading" aria-busy="true" aria-live="polite">
      <p className="muted">正在打开…</p>
    </main>
  );
}
