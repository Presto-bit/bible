'use client';

/**
 * Standalone 首启黄金链路（内容优先）：
 * 1) 恢复装前深链 / 留在首页今日
 * 2) 等有效读经（或短兜底）后再问「读经提醒」
 * 3) 开了提醒再软设密；均可跳过，不挡读经
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BRAND_NAME } from '@/lib/brand';
import { ONBOARDING_DONE_EVENT, ONBOARDING_SEEN_KEY } from '@/lib/onboarding';
import { isStandalone } from '@/lib/pwa_platform';
import {
  isPwaFirstOpenDone,
  markPwaFirstOpenDone,
  markPwaFirstOpenWaiting,
  PWA_FIRST_OPEN_FALLBACK_MS,
  PWA_VALUE_EVENT,
} from '@/lib/pwa_first_open';
import { consumePostInstallPath, peekPostInstallPath } from '@/lib/wechat_escape';
import { ensurePermission, getReminder, setReminder } from '@/lib/reminder';
import { hasPassword } from '@/lib/api';
import { reminderHeroSub, reminderHeroTitle } from '@/lib/beiai_habit_copy';
import AccountSecurityCard from '@/components/AccountSecurityCard';
import { clearSharePwaDismiss } from '@/lib/share_pwa_guide';

type Step = 'reminder' | 'account';

function skipGenericOnboarding(): void {
  try {
    if (!localStorage.getItem(ONBOARDING_SEEN_KEY)) {
      localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
      window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
    }
  } catch {
    /* ignore */
  }
}

function trackFirstOpen(props: Record<string, unknown>): void {
  void import('@/lib/product_events').then((m) =>
    m.trackProductEvent('app_open', {
      props: { funnel: 'standalone_first_open', ...props },
    }),
  );
}

export default function PwaFirstOpenGuide() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const sheetShown = useRef(false);

  const finish = (outcome: string) => {
    markPwaFirstOpenDone();
    setStep(null);
    trackFirstOpen({ step: 'done', outcome });
    consumePostInstallPath();
  };

  const openHabitSheet = (reason: string) => {
    if (sheetShown.current || isPwaFirstOpenDone()) return;
    sheetShown.current = true;
    clearSharePwaDismiss();

    if (getReminder().enabled) {
      if (hasPassword()) {
        finish(`skip_habit_${reason}`);
        return;
      }
      setStep('account');
      trackFirstOpen({ step: 'account', reason });
      return;
    }

    setStep('reminder');
    trackFirstOpen({ step: 'reminder', reason });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isStandalone() || isPwaFirstOpenDone() || started.current) return;
    started.current = true;

    skipGenericOnboarding();
    clearSharePwaDismiss();

    const deepPeek = peekPostInstallPath();
    trackFirstOpen({
      step: 'land',
      has_deep_link: Boolean(deepPeek),
    });

    const deep = consumePostInstallPath();
    if (deep && deep !== '/' && deep !== window.location.pathname + window.location.search) {
      router.push(deep);
    }

    markPwaFirstOpenWaiting();

    const onValue = () => openHabitSheet('value');
    window.addEventListener(PWA_VALUE_EVENT, onValue);
    const t = window.setTimeout(() => openHabitSheet('fallback'), PWA_FIRST_OPEN_FALLBACK_MS);

    return () => {
      window.removeEventListener(PWA_VALUE_EVENT, onValue);
      window.clearTimeout(t);
    };
    // 仅 standalone 首启跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const enableReminder = async () => {
    setBusy(true);
    let granted = false;
    try {
      granted = await ensurePermission();
      if (granted) {
        const cur = getReminder();
        setReminder({ ...cur, enabled: true }, { source: 'pwa_first_open' });
      }
    } finally {
      setBusy(false);
      if (hasPassword()) {
        finish(granted ? 'reminder_on' : 'reminder_denied');
      } else {
        setStep('account');
        trackFirstOpen({ step: 'account', reason: granted ? 'after_reminder' : 'after_denied' });
      }
    }
  };

  if (!step) return null;

  return (
    <div className="sheet-backdrop pwa-first-open-backdrop" style={{ zIndex: 145 }}>
      <div
        className="sheet card pwa-first-open-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-first-open-title"
      >
        {step === 'reminder' ? (
          <>
            <p className="eyebrow">{BRAND_NAME}</p>
            <h2 id="pwa-first-open-title" style={{ marginTop: 4 }}>
              {reminderHeroTitle(false)}
            </h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>
              {reminderHeroSub(false)}
              。留一个轻提醒，明天更容易从主屏幕回来。
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
              onClick={() => finish('reminder_skip')}
            >
              先继续读经
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
            <AccountSecurityCard onComplete={() => finish('password_set')} />
            <button
              type="button"
              className="text-link"
              style={{ marginTop: 4 }}
              onClick={() => finish('password_skip')}
            >
              跳过，继续读经
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
