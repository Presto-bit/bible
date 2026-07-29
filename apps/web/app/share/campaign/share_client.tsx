'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { BRAND_NAME } from '@/lib/brand';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { detectInstallPlatform } from '@/lib/pwa_platform';

export function CampaignShareClient({
  campaignId,
  day,
}: {
  campaignId: string;
  day?: number;
}) {
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    captureAcquisitionFromLocation();
    setShowInstall(detectInstallPlatform() !== 'standalone');
  }, []);

  const href = campaignId
    ? `/campaigns/view/${encodeURIComponent(campaignId)}${day ? `?day=${day}` : ''}`
    : '/';

  return (
    <div className="share-landing-ctas">
      <Link className="btn btn-primary" href={href}>
        {campaignId ? '打开活动' : `打开${BRAND_NAME}`}
      </Link>
      {showInstall ? (
        <button type="button" className="btn" onClick={() => openPwaInstallSheet()}>
          保存到主屏幕
        </button>
      ) : null}
    </div>
  );
}
