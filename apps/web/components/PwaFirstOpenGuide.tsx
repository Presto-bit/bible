'use client';

/**
 * Standalone 首启：欢迎 → 开启读经提醒 → 软设密（均可跳过）。
 * 装完主屏幕后的注册/回访黄金链路。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { isOnboardingSeen, ONBOARDING_DONE_EVENT } from '@/lib/onboarding';
import { isStandalone } from '@/lib/pwa_platform';
import {
  isPwaFirstOpenDone,
  markPwaFirstOpenDone,
} from '@/lib/pwa_first_open';
import { consumePostInstallPath } from '@/lib/wechat_escape';
import { ensurePermission, getReminder, setReminder } from '@/lib/reminder';
import { hasPassword } from '@/lib/api';
import { reminderHeroSub, reminderHeroTitle } from '@/lib/beiai_habit_copy';
import AccountSecurityCard from '@/components/AccountSecurityCard';
import { clearSharePwaDismiss } from '@/lib/share_pwa_guide';

type Step = 'welcome' | 'reminder' | 'account' | 'done';

export default function PwaFirstOpenGuide() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStandalone() || isPwaFirstOpenDone()) return;

    const maybeOpen = () => {
      if (!isOnboardingSeen()) return;
      clearSharePwaDismiss();
      setStep('welcome');
    };

    maybeOpen();
    window.addEventListener(ONBOARDING_DONE_EVENT, maybeOpen);
    return () => window.removeEventListener(ONBOARDING_DONE_EVENT, maybeOpen);
  }, []);

  const finish = () => {
    markPwaFirstOpenDone();
    setStep(null);
    const deep = consumePostInstallPath();
    if (deep && deep !== '/' && deep !== window.location.pathname + window.location.search) {
      router.push(deep);
    }
  };

  const enableReminder = async () => {
    setBusy(true);
    try {
      const ok = await ensurePermission();
      if (ok) {
        const cur = getReminder();
        setReminder({ ...cur, enabled: true });
      }
    } finally {
      setBusy(false);
      if (hasPassword()) finish();
      else setStep('account');
    }
  };

  if (!step || step === 'done') return null;

  return (
    <div className="sheet-backdrop pwa-first-open-backdrop" style={{ zIndex: 145 }}>
      <div
        className="sheet card pwa-first-open-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-first-open-title"
      >
        {step === 'welcome' ? (
          <>
            <p className="eyebrow">{BRAND_NAME}</p>
            <h2 id="pwa-first-open-title" style={{ marginTop: 4 }}>
              已在主屏幕，下次一点就开
            </h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>
              {BRAND_TAGLINE}。先留一个轻提醒，读经会更容易回来。
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setStep('reminder')}>
              继续
            </button>
            <button type="button" className="text-link" style={{ marginTop: 10 }} onClick={finish}>
              先去读经
            </button>
          </>
        ) : null}

        {step === 'reminder' ? (
          <>
            <h2 id="pwa-first-open-title" style={{ marginTop: 0 }}>
              {reminderHeroTitle(false)}
            </h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>
              {reminderHeroSub(false)}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => void enableReminder()}
            >
              {busy ? '开启中…' : '开启读经提醒'}
            </button>
            <button
              type="button"
              className="text-link"
              style={{ marginTop: 10 }}
              onClick={() => {
                if (hasPassword()) finish();
                else setStep('account');
              }}
            >
              稍后再说
            </button>
          </>
        ) : null}

        {step === 'account' ? (
          <>
            <h2 id="pwa-first-open-title" style={{ marginTop: 0 }}>
              可选：设个密码，换机也能找回
            </h2>
            <p className="muted" style={{ lineHeight: 1.55, marginBottom: 8 }}>
              不设也能用。删掉主屏幕重装时，有密码更安心。
            </p>
            <AccountSecurityCard onComplete={finish} />
            <button type="button" className="text-link" style={{ marginTop: 4 }} onClick={finish}>
              跳过，开始读经
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
