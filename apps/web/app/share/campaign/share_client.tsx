'use client';

import { useEffect } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';

export function CampaignShareClient({
  campaignId,
  day,
}: {
  campaignId: string;
  day?: number;
}) {
  useEffect(() => {
    captureAcquisitionFromLocation();
  }, []);

  const href = campaignId
    ? `/campaigns/view/${encodeURIComponent(campaignId)}${day ? `?day=${day}` : ''}`
    : '/';

  return (
    <ShareLandingCtas
      preferContentPrimary
      contentPrimary={{
        label: campaignId ? '打开活动' : '进入首页',
        onClick: () => {
          window.location.assign(href);
        },
      }}
      secondary={campaignId ? [{ href: '/', label: '进入首页' }] : []}
    />
  );
}
