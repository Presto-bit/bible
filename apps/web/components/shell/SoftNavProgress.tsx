'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { endSoftNavProgressIfArrived, subscribeSoftNavFail, subscribeSoftNavProgress } from '@/lib/soft_nav_progress';
import { clearPendingSecondaryNav, getPendingSecondaryTarget } from '@/lib/pwa_tab_nav';
import { normalizeAppPath } from '@/lib/tab_keep_alive';
import { useToast } from '@/components/ui/ToastProvider';

/** 弱网 soft nav 顶栏进度；到达目标才收起；超时清 pending 并 toast。 */
export default function SoftNavProgress() {
  const pathname = usePathname();
  const toast = useToast();
  const [active, setActive] = useState(false);

  useEffect(() => {
    return subscribeSoftNavProgress((d) => setActive(Boolean(d.active)));
  }, []);

  useEffect(() => {
    return subscribeSoftNavFail(() => {
      clearPendingSecondaryNav();
      window.dispatchEvent(new Event('presto-tab-nav'));
      toast('打开较慢，请再试一次');
    });
  }, [toast]);

  useEffect(() => {
    endSoftNavProgressIfArrived(pathname);
    const target = getPendingSecondaryTarget();
    if (!target) return;
    const cur = normalizeAppPath(pathname);
    if (cur === target || cur.startsWith(`${target}/`)) {
      clearPendingSecondaryNav();
      window.dispatchEvent(new Event('presto-tab-nav'));
    }
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="soft-nav-progress" role="progressbar" aria-label="正在打开" aria-busy="true">
      <div className="soft-nav-progress-bar" />
    </div>
  );
}
