'use client';

import { useEffect, useState } from 'react';
import { BRAND_NAME, BRAND_PWA_SUBTITLE } from '@/lib/brand';
import { ONBOARDING_DONE_EVENT, ONBOARDING_SEEN_KEY } from '@/lib/onboarding';

/** 首访欢迎：单步开始使用；设密改「我的」软催，安装改底栏横幅。 */
export default function WebOnboardingSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(ONBOARDING_SEEN_KEY)) return;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="sheet-backdrop" style={{ zIndex: 140 }}>
      <div className="sheet card onboarding-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{BRAND_NAME}</h2>
        <p className="muted" style={{ lineHeight: 1.65 }}>{BRAND_PWA_SUBTITLE}，在话语中相遇</p>
        <p style={{ fontSize: 14, lineHeight: 1.65 }}>
          打开即可读经、记笔记、做每日问答。换机同步可稍后在「我的」设置用户名与密码。
        </p>
        <button type="button" className="btn" onClick={finish}>开始使用</button>
      </div>
    </div>
  );
}
