'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  endSoftNavProgress,
  subscribeSoftNavProgress,
} from '@/lib/soft_nav_progress';

/** 弱网 soft nav 顶栏细进度，避免二级页 chunk 未到时像「点了没反应」。 */
export default function SoftNavProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    return subscribeSoftNavProgress((d) => setActive(Boolean(d.active)));
  }, []);

  useEffect(() => {
    endSoftNavProgress();
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="soft-nav-progress" role="progressbar" aria-label="正在打开" aria-busy="true">
      <div className="soft-nav-progress-bar" />
    </div>
  );
}
