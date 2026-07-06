'use client';

import { useEffect, useState } from 'react';
import { BRAND_NAME, BRAND_PWA_SUBTITLE } from '@/lib/brand';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { isStandalonePwa } from '@/lib/platform';

const KEY = 'presto_onboarding_seen';

export default function WebOnboardingSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(KEY)) return;
    setCanInstall(!isStandalonePwa());
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  const finish = () => {
    localStorage.setItem(KEY, '1');
    setOpen(false);
  };

  const maxStep = canInstall ? 2 : 1;

  if (!open) return null;

  return (
    <div className="sheet-backdrop" style={{ zIndex: 140 }}>
      <div className="sheet card onboarding-sheet" onClick={(e) => e.stopPropagation()}>
        {step === 0 ? (
          <>
            <h2 style={{ marginTop: 0 }}>{BRAND_NAME}</h2>
            <p className="muted" style={{ lineHeight: 1.65 }}>{BRAND_PWA_SUBTITLE}，在话语中相遇</p>
            <p style={{ fontSize: 14, lineHeight: 1.65 }}>
              打开即可读经、记笔记、做每日问答。笔记与进度会自动备份到云端。
            </p>
            <button type="button" className="btn" onClick={() => setStep(1)}>下一步</button>
            <button type="button" className="text-link" style={{ display: 'block', margin: '12px auto 0' }} onClick={finish}>
              跳过
            </button>
          </>
        ) : step === 1 ? (
          <>
            <h3 style={{ marginTop: 0 }}>换机也能找回</h3>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.65 }}>
              在「我的」设置用户名和密码，换设备时凭账号恢复，无需记住数字 ID。
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => (canInstall ? setStep(2) : finish())}
            >
              {canInstall ? '下一步' : '开始使用'}
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
          {step + 1} / {maxStep + 1}
        </span>
      </div>
    </div>
  );
}
