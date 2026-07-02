'use client';

import { useEffect } from 'react';
import { ensureAccountReady } from '@/lib/api';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';

/** 应用启动：恢复身份 → 建档 → 后台下载离线经包（不阻塞 SSR，避免发版 health check 失败） */
export default function IdentityShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void ensureAccountReady().then(() => {
      void ensureOfflinePackAutoDownload();
    });
  }, []);
  return <>{children}</>;
}
