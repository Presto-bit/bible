'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa_platform';

export function InviteAppClient() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    captureAcquisitionFromLocation();
    setPlatform(detectInstallPlatform());
  }, []);

  const inApp = platform === 'inapp';
  const standalone = platform === 'standalone';

  return (
    <div className="invite-app-ctas">
      {standalone ? (
        <Link className="btn" href="/">
          开始读经
        </Link>
      ) : (
        <button type="button" className="btn" onClick={() => openPwaInstallSheet()}>
          {inApp ? '查看如何保存成 App' : '保存到主屏幕'}
        </button>
      )}
      <Link className="btn btn-ghost" href="/assistant">
        先问问小爱
      </Link>
    </div>
  );
}
