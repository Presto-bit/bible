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
import { clientWithBasePath } from '@/lib/basePath';
import { useToast } from '@/components/ui/ToastProvider';

/** soft-nav 失败：硬跳目标页，避免卡在「正在打开」或整页 502 假死 */
function hardAssignSoftNavTarget(href: string) {
  if (typeof window === 'undefined') return;
  const path = (href.split('?')[0] ?? href).trim();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const query = href.includes('?') ? href.slice(href.indexOf('?')) : '';
  const target = clientWithBasePath(`${normalized}${query}`);
  const cur = `${window.location.pathname}${window.location.search}`;
  if (cur === target || normalizeAppPath(window.location.pathname) === normalized) {
    // 已在目标或乐观壳已可用：仅收 pending，避免无意义整页刷新
    settleSoftSecondaryNav();
    return;
  }
  window.location.assign(target);
}

/** 弱网 soft nav：仅顶栏细进度；到达目标立刻收起；超时硬跳兜底。 */
export default function SoftNavProgress() {
  const pathname = usePathname();
  const toast = useToast();
  const [active, setActive] = useState(false);

  useEffect(() => {
    return subscribeSoftNavProgress((d) => setActive(Boolean(d.active)));
  }, []);

  useEffect(() => {
    return subscribeSoftNavFail((d) => {
      const href = d?.href || getPendingSecondaryTarget() || '';
      if (!href) {
        settleSoftSecondaryNav();
        toast('打开较慢，请再试一次');
        return;
      }
      toast('网络较慢，正在重新打开…');
      // 先硬跳；勿先 settle，否则乐观壳会闪回「我的」
      hardAssignSoftNavTarget(href);
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
