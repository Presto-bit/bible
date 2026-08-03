'use client';

/**
 * 浏览器首访欢迎（非壳 / 非主屏幕）。
 *
 * 历史坑：遮罩无 onClick + 壳内误弹 → TWA「我的」设置/成就/旅程点了没反应
 *（与 PwaFirstOpenGuide 曾出过的问题同类）。壳/主屏幕一律走 PwaFirstOpenGuide。
 */

import { useEffect, useState } from 'react';
import DismissibleSheetBackdrop from '@/components/ui/DismissibleSheetBackdrop';
import { BRAND_NAME, BRAND_PWA_SUBTITLE } from '@/lib/brand';
import { ONBOARDING_DONE_EVENT, ONBOARDING_SEEN_KEY } from '@/lib/onboarding';
import { isPwaFirstOpenDone } from '@/lib/pwa_first_open';
import { isStandalone } from '@/lib/pwa_platform';

function markOnboardingSeen(): void {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    window.dispatchEvent(new Event(ONBOARDING_DONE_EVENT));
  } catch {
    /* ignore */
  }
}

/** 首访欢迎：单步开始使用；设密改「我的」软催，安装改底栏横幅。 */
export default function WebOnboardingSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(ONBOARDING_SEEN_KEY) === '1') return;

    // 安卓壳 / iOS 主屏幕：永不挂这层全屏遮罩
    if (isStandalone() || isPwaFirstOpenDone()) {
      markOnboardingSeen();
      return;
    }

    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    markOnboardingSeen();
    setOpen(false);
  };

  if (!open) return null;

  return (
    <DismissibleSheetBackdrop onClose={finish}>
      <div
        className="sheet card onboarding-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-onboarding-title"
      >
        <h2 id="web-onboarding-title" style={{ marginTop: 0 }}>
          {BRAND_NAME}
        </h2>
        <p className="muted" style={{ lineHeight: 1.65 }}>
          {BRAND_PWA_SUBTITLE}，在话语中相遇
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.65 }}>
          打开即可读经、记笔记、做每日问答。换机同步可稍后在「我的」设置密码。
        </p>
        <button type="button" className="btn" onClick={finish}>
          开始使用
        </button>
      </div>
    </DismissibleSheetBackdrop>
  );
}
