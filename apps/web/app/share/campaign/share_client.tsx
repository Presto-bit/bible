'use client';

import { useEffect } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { BRAND_NAME } from '@/lib/brand';
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
      installLabel="保存到主屏幕"
      secondary={[
        { href, label: campaignId ? '打开活动' : `打开${BRAND_NAME}` },
      ]}
    />
  );
}
