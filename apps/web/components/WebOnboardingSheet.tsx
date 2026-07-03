'use client';

import { useEffect, useState } from 'react';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';

const KEY = 'presto_onboarding_seen';

export default function WebOnboardingSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(KEY)) return;
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    localStorage.setItem(KEY, '1');
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="sheet-backdrop" style={{ zIndex: 140 }}>
      <div className="sheet card onboarding-sheet" onClick={(e) => e.stopPropagation()}>
        {step === 0 ? (
          <>
            <h2 style={{ marginTop: 0 }}>{BRAND_NAME}</h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>{BRAND_TAGLINE}</p>
            <p style={{ fontSize: 14, lineHeight: 1.65 }}>
              打开即可读经、记笔记、做每日问答。笔记与进度会自动备份到云端。
            </p>
            <button type="button" className="btn" onClick={() => setStep(1)}>下一步</button>
            <button type="button" className="text-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={finish}>
              跳过
            </button>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>换机也能找回</h3>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.65 }}>
              在「我的」设置用户名和密码，换设备时凭账号恢复，无需记住数字 ID。
            </p>
            <button type="button" className="btn" onClick={finish}>开始使用</button>
          </>
        )}
      </div>
    </div>
  );
}
