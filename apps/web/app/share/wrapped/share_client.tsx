'use client';

import { useEffect } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { BRAND_NAME } from '@/lib/brand';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';

export function WrappedShareClient({ period }: { period: 'month' | 'year' }) {
  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  return (
    <ShareLandingCtas
      installLabel="保存到主屏幕"
      secondary={[
        { href: `/wrapped?period=${period}`, label: '查看我的回顾' },
        { href: '/', label: `打开${BRAND_NAME}` },
      ]}
    />
  );
}
