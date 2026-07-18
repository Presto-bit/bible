'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  dismissHomeOnboarding,
  isHomeOnboardingDismissed,
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
      if (isHomeOnboardingDismissed()) {
        if (!cancelled) setStage(null);
        return;
      }
      void resolveHomeOnboarding().then((s) => {
        // S3 常规态不展示；S0/S1/S2 均可展示并可关闭
        if (!cancelled) setStage(s.stage === 'S3' ? null : s.stage);
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

  const close = () => {
    dismissHomeOnboarding();
    setStage(null);
  };

  if (!stage) return null;
  const cta = onboardingCta(stage);
  if (!cta.title) return null;

  return (
    <div className="card card-2 home-onboarding-banner">
      <div className="home-onboarding-head">
        <strong className="home-onboarding-title">{cta.title}</strong>
        <button
          type="button"
          className="icon-btn home-onboarding-close"
          aria-label="关闭，不再显示"
          title="关闭，不再显示"
          onClick={close}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <p className="muted home-onboarding-body">{cta.body}</p>
      <Link className="btn" href={cta.href}>
        {cta.label}
      </Link>
    </div>
  );
}
