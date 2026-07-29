'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { BRAND_NAME } from '@/lib/brand';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { detectInstallPlatform } from '@/lib/pwa_platform';

export function WrappedShareClient({ period }: { period: 'month' | 'year' }) {
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    captureAcquisitionFromLocation();
    setShowInstall(detectInstallPlatform() !== 'standalone');
  }, []);

  return (
    <div className="share-landing-ctas">
      <Link className="btn btn-primary" href={`/wrapped?period=${period}`}>
        查看我的回顾
      </Link>
      <Link className="btn" href="/">
        打开{BRAND_NAME}
      </Link>
      {showInstall ? (
        <button type="button" className="btn" onClick={() => openPwaInstallSheet()}>
          保存到主屏幕
        </button>
      ) : null}
    </div>
  );
}
