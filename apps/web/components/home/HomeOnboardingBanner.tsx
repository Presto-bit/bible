'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  onboardingCta,
  resolveHomeOnboarding,
  type HomeOnboardingStage,
} from '@/lib/home_onboarding';
import { subscribeLocalDataChanged } from '@/lib/local_data_events';
const OFFLINE_PACK_READY = 'presto-offline-pack-ready';

export default function HomeOnboardingBanner() {
  const [stage, setStage] = useState<HomeOnboardingStage | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void resolveHomeOnboarding().then((s) => {
        // S0 经包下载改在「我的 → 设置」提示，首页不打扰
        if (!cancelled) setStage(s.stage === 'S3' || s.stage === 'S0' ? null : s.stage);
      });
    };
    refresh();
    const onData = () => refresh();
    window.addEventListener(OFFLINE_PACK_READY, onData);
    const unsub = subscribeLocalDataChanged(onData);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_PACK_READY, onData);
      unsub();
    };
  }, []);

  if (!stage) return null;
  const cta = onboardingCta(stage);
  if (!cta.title) return null;

  return (
    <div className="card card-2 home-onboarding-banner" style={{ marginBottom: 12 }}>
      <strong style={{ fontSize: 15 }}>{cta.title}</strong>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 10px', lineHeight: 1.55 }}>
        {cta.body}
      </p>
      <Link className="btn" href={cta.href} style={{ display: 'inline-block', marginTop: 0 }}>
        {cta.label}
      </Link>
    </div>
  );
}
