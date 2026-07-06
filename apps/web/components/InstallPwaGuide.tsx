'use client';

import { useEffect, useState } from 'react';
import { SheetCloseButton } from '@/components/PageBackBar';
import { PWA_HOME_NAME, PWA_HOME_SUBTITLE } from '@/lib/pwa_brand';
import {
  detectInstallPlatform,
  installHeadline,
  installSteps,
  type InstallPlatform,
} from '@/lib/pwa_platform';
import { BASE_PATH } from '@/lib/basePath';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed';
export const PWA_INSTALL_SHEET_EVENT = 'presto-pwa-install-open';

function isDismissed(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(PWA_INSTALL_DISMISS_KEY) === '1';
}

export function openPwaInstallSheet() {
  window.dispatchEvent(new Event(PWA_INSTALL_SHEET_EVENT));
}

/** 分平台安装引导（图示步骤 + Android 系统安装） */
export function InstallPwaSheet({
  open,
  onClose,
  platform: platformProp,
}: {
  open: boolean;
  onClose: () => void;
  platform?: InstallPlatform;
}) {
  const [platform, setPlatform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);

  useEffect(() => {
    if (platformProp) setPlatform(platformProp);
    else setPlatform(detectInstallPlatform());
  }, [platformProp, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [open]);

  if (!open || platform === 'standalone') return null;

  const steps = installSteps(platform);
  const iconSrc = `${BASE_PATH || ''}/apple-touch-icon.png`;

  const dismiss = () => {
    localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1');
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card install-pwa-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>添加到主屏幕</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="install-pwa-brand">
          <img src={iconSrc} alt="" width={72} height={72} className="install-pwa-icon" />
          <div>
            <strong className="install-pwa-name">{PWA_HOME_NAME}</strong>
            <span className="muted install-pwa-sub">{PWA_HOME_SUBTITLE}</span>
          </div>
        </div>

        <p className="install-pwa-headline">{installHeadline(platform)}</p>

        <ol className="install-pwa-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="install-pwa-step-num">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <span className="muted">{s.detail}</span>
              </div>
            </li>
          ))}
        </ol>

        {platform === 'android-chrome' && deferred ? (
          <button
            type="button"
            className="btn btn-block"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice;
              setDeferred(null);
              dismiss();
            }}
          >
            立即添加
          </button>
        ) : null}

        {platform === 'inapp' ? (
          <button
            type="button"
            className="btn btn-block"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
              } catch {
                /* ignore */
              }
            }}
          >
            复制链接
          </button>
        ) : null}

        <button type="button" className="text-link install-pwa-dismiss" onClick={dismiss}>
          暂不安装
        </button>
      </div>
    </div>
  );
}

/** 底部轻量 Banner：点击展开完整引导 */
export default function InstallBanner() {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setPlatform(detectInstallPlatform());
    sync();
    const onOpen = () => {
      setHidden(false);
      setSheetOpen(true);
    };
    window.addEventListener(PWA_INSTALL_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(PWA_INSTALL_SHEET_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (platform === null) return;
    if (platform === 'standalone' || isDismissed()) {
      setHidden(true);
    }
  }, [platform]);

  if (hidden || !platform || platform === 'standalone') {
    return <InstallPwaSheet open={sheetOpen} onClose={() => setSheetOpen(false)} platform={platform ?? undefined} />;
  }

  const shortMsg =
    platform === 'inapp'
      ? '微信内无法安装，请用浏览器打开'
      : platform === 'ios-safari' || platform === 'ios-other'
        ? '添加到主屏幕，像 App 一样读经'
        : '添加到主屏幕，离线也能打开';

  return (
    <>
      <div className="install-banner" role="region" aria-label="安装到主屏幕">
        <button type="button" className="install-banner-main" onClick={() => setSheetOpen(true)}>
          <span>{shortMsg}</span>
          <span className="install-banner-cta">查看步骤</span>
        </button>
        <button
          type="button"
          className="install-banner-close"
          onClick={() => {
            setHidden(true);
            localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1');
          }}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <InstallPwaSheet open={sheetOpen} onClose={() => setSheetOpen(false)} platform={platform} />
    </>
  );
}
