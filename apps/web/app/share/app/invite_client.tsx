'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { captureAcquisitionFromLocation } from '@/lib/acquisition';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { ShareLandingCtas } from '@/components/ShareLandingCtas';
import {
  detectInstallPlatform,
  installHeadline,
  installSteps,
  type InstallPlatform,
} from '@/lib/pwa_platform';

export function InviteAppClient({
  showInstallSteps = false,
}: {
  /** 仅渲染「怎么保存」步骤区块（页面下半） */
  showInstallSteps?: boolean;
}) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);

  useEffect(() => {
    if (showInstallSteps) {
      setPlatform(detectInstallPlatform());
      return;
    }
    captureAcquisitionFromLocation();
    setPlatform(detectInstallPlatform());
  }, [showInstallSteps]);

  if (showInstallSteps) {
    if (!platform || platform === 'standalone') return null;
    const steps = installSteps(platform);
    if (!steps.length) return null;
    return (
      <section className="invite-app-section" aria-labelledby="invite-save-title">
        <h2 id="invite-save-title" className="invite-app-section-title">
          保存到主屏幕，下次一点就开
        </h2>
        <p className="muted invite-app-save-lead">{installHeadline(platform)}</p>
        <ol className="invite-app-steps">
          {steps.map((s, i) => (
            <li key={`${s.title}-${i}`} className="invite-app-step">
              <strong>{s.title}</strong>
              <span className="muted">{s.detail}</span>
            </li>
          ))}
        </ol>
        {platform === 'inapp' ? null : (
          <button type="button" className="text-link invite-app-steps-more" onClick={() => openPwaInstallSheet()}>
            看图解步骤
          </button>
        )}
      </section>
    );
  }

  if (platform === 'standalone') {
    return (
      <div className="share-landing-ctas invite-app-ctas">
        <Link className="btn btn-primary" href="/">
          开始读经
        </Link>
      </div>
    );
  }

  return (
    <ShareLandingCtas
      installLabel="保存到主屏幕"
      secondary={[{ href: '/', label: '先看看今日经文' }]}
    />
  );
}
