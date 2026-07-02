'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { ensureAccountReady } from '@/lib/api';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';

/** 阻塞页面抢跑：身份恢复完成后再渲染子树，避免 guestId 竞态生成新 ID */
export default function IdentityShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    let cancelled = false;
    void ensureAccountReady()
      .then(() => {
        if (!cancelled) setReady(true);
        void ensureOfflinePackAutoDownload();
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
