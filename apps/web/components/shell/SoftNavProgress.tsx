'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  endSoftNavProgressIfArrived,
  subscribeSoftNavFail,
  subscribeSoftNavProgress,
} from '@/lib/soft_nav_progress';
import {
  getPendingSecondaryTarget,
  settleSoftSecondaryNav,
} from '@/lib/pwa_tab_nav';
import { normalizeAppPath } from '@/lib/tab_keep_alive';
import { useToast } from '@/components/ui/ToastProvider';

/** 弱网 soft nav：仅顶栏细进度；到达目标立刻收起，避免残留「遮罩感」。 */
export default function SoftNavProgress() {
  const pathname = usePathname();
  const toast = useToast();
  const [active, setActive] = useState(false);

  useEffect(() => {
    return subscribeSoftNavProgress((d) => setActive(Boolean(d.active)));
  }, []);

  useEffect(() => {
    return subscribeSoftNavFail(() => {
      settleSoftSecondaryNav();
      toast('打开较慢，请再试一次');
    });
  }, [toast]);

  useEffect(() => {
    endSoftNavProgressIfArrived(pathname);
    const target = getPendingSecondaryTarget();
    if (!target) return;
    const cur = normalizeAppPath(pathname);
    if (cur === target || cur.startsWith(`${target}/`)) {
      settleSoftSecondaryNav();
    }
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="soft-nav-progress" role="progressbar" aria-label="正在打开" aria-busy="true">
      <div className="soft-nav-progress-bar" />
    </div>
  );
}
