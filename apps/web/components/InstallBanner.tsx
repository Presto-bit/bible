'use client';

import { useEffect, useState } from 'react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isInAppBrowser(): boolean {
  return /MicroMessenger|QQ\//i.test(navigator.userAgent);
}

type BannerMode = 'android' | 'ios' | 'inapp' | null;

// Android：beforeinstallprompt；iOS：无系统弹窗，需引导「分享 → 添加到主屏幕」。
export default function InstallBanner() {
  const [mode, setMode] = useState<BannerMode>(null);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return;

    if (isInAppBrowser()) {
      setMode('inapp');
      return;
    }

    if (isIOS()) {
      setMode('ios');
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setMode('android');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setHidden(true);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  if (hidden || !mode) return null;
  if (mode === 'android' && !deferred) return null;

  const message =
    mode === 'inapp'
      ? '微信内无法安装应用，请点击右上角「…」在浏览器中打开'
      : mode === 'ios'
        ? '添加到主屏幕：点 Safari 底部分享 →「添加到主屏幕」'
        : '把「彼爱」添加到主屏幕，离线也能打开';

  return (
    <div
      className="install-banner"
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 88,
        maxWidth: 688,
        margin: '0 auto',
        background: 'var(--accent-deep)',
        color: '#fff',
        borderRadius: 14,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 50,
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}
    >
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>{message}</span>
      {mode === 'android' && deferred ? (
        <button
          type="button"
          style={{
            background: '#fff',
            color: 'var(--accent-deep)',
            border: 'none',
            borderRadius: 18,
            padding: '6px 14px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
            dismiss();
          }}
        >
          添加
        </button>
      ) : null}
      <button
        type="button"
        style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', flexShrink: 0 }}
        onClick={dismiss}
        aria-label="关闭"
      >
        ✕
      </button>
    </div>
  );
}
