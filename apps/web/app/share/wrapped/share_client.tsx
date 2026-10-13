'use client';

import { useEffect } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';

export function WrappedShareClient({ period }: { period: 'month' | 'year' }) {
  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  const href = `/wrapped?period=${period}`;

  return (
    <ShareLandingCtas
      preferContentPrimary
      contentPrimary={{
        label: '查看这段回顾',
        onClick: () => {
          window.location.assign(href);
        },
      }}
      secondary={[{ href: '/', label: '进入首页' }]}
    />
  );
}
