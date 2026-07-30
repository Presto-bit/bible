'use client';

import { useEffect } from 'react';
import { ensureAccountReady } from '@/lib/api';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { scheduleOfflinePackAutoDownload } from '@/lib/offline_bootstrap';

/** 应用启动：采渠道 → 恢复身份 → 建档；经包延后调度，不挡首屏 */
export default function AccountBootstrap() {
  useEffect(() => {
    captureAcquisitionFromLocation();
    void import('@/lib/product_events').then((m) => m.trackAppOpen());
    void ensureAccountReady().then(() => {
      scheduleOfflinePackAutoDownload();
    });
  }, []);
  return null;
}
