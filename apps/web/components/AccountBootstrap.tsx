'use client';

import { useEffect } from 'react';
import { ensureAccountReady } from '@/lib/api';
import { ensureOfflinePackAutoDownload } from '@/lib/offline_bootstrap';

/** 应用启动：恢复身份 → 建档 → 后台下载离线经包 */
export default function AccountBootstrap() {
  useEffect(() => {
    void ensureAccountReady().then(() => {
      void ensureOfflinePackAutoDownload();
    });
  }, []);
  return null;
}
