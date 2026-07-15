'use client';

import { useEffect, useState } from 'react';
import { BRAND_NAME, BRAND_PWA_SUBTITLE } from '@/lib/brand';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { isFinePointerDesktop, isStandalonePwa } from '@/lib/platform';
import { ONBOARDING_DONE_EVENT, ONBOARDING_SEEN_KEY } from '@/lib/onboarding';
import {
  ACCOUNT_GATE_DONE_EVENT,
  shouldPromptAccountGate,
} from '@/lib/account_guide';

export default function WebOnboardingSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(ONBOARDING_SEEN_KEY)) return;

    const tryOpen = () => {
      // 账号门闸优先，避免叠弹
      if (shouldPromptAccountGate()) return;
      setCanInstall(!isStandalonePwa() && !isFinePointerDesktop());
      setOpen(true);
    };

    const t = window.setTimeout(tryOpen, 900);
    window.addEventListener(ACCOUNT_GATE_DONE_EVENT, tryOpen);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(ACCOUNT_GATE_DONE_EVENT, tryOpen);
    };
  }, []);

  const finish = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
    setOpen(false);
  };

  if (!open) return null;

  // 欢迎 →（可选）安装；账号保护已由 AccountGate 承接
  if (!canInstall) {
    return (
      <div className="sheet-backdrop" style={{ zIndex: 140 }}>
        <div className="sheet card onboarding-sheet" onClick={(e) => e.stopPropagation()}>
          <h2 style={{ marginTop: 0 }}>{BRAND_NAME}</h2>
          <p className="muted" style={{ lineHeight: 1.65 }}>{BRAND_PWA_SUBTITLE}，在话语中相遇</p>
          <p style={{ fontSize: 14, lineHeight: 1.65 }}>
            打开即可读经、记笔记、做每日问答。设置账号后，换机也能找回进度。
          </p>
          <button type="button" className="btn" onClick={finish}>开始使用</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" style={{ zIndex: 140 }}>
      <div className="sheet card onboarding-sheet" onClick={(e) => e.stopPropagation()}>
        {step === 0 ? (
          <>
            <h2 style={{ marginTop: 0 }}>{BRAND_NAME}</h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>{BRAND_PWA_SUBTITLE}，在话语中相遇</p>
            <p style={{ fontSize: 14, lineHeight: 1.65 }}>
              打开即可读经、记笔记、做每日问答。设置账号后，换机也能找回进度。
            </p>
            <button type="button" className="btn" onClick={() => setStep(1)}>下一步</button>
            <button type="button" className="text-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={finish}>
              跳过
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>添加到主屏幕</h3>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.65 }}>
              像 App 一样全屏打开，图标与 iPhone 主屏幕一致，名称显示「{BRAND_NAME}」。
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                finish();
                openPwaInstallSheet();
              }}
            >
              查看安装步骤
            </button>
            <button type="button" className="text-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={finish}>
              稍后再说
            </button>
          </>
        )}
        <span className="muted" style={{ display: 'block', textAlign: 'center', fontSize: 11, marginTop: 8 }}>
          {step + 1} / 2
        </span>
      </div>
    </div>
  );
}
