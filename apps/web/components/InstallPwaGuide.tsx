'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SheetCloseButton } from '@/components/PageBackBar';
import { PWA_HOME_NAME, PWA_HOME_SUBTITLE } from '@/lib/pwa_brand';
import {
  detectInstallPlatform,
  installHeadline,
  installSteps,
  type InstallPlatform,
} from '@/lib/pwa_platform';
import { BASE_PATH } from '@/lib/basePath';
import {
  getDeferredInstallPrompt,
  clearDeferredInstallPrompt,
} from '@/lib/pwa_deferred_prompt';
import { isOnboardingSeen, ONBOARDING_DONE_EVENT } from '@/lib/onboarding';
import { syncResyncAccount } from '@/lib/sync';
import { hasPassword, currentUserId } from '@/lib/api';
import { useToast } from '@/components/ui/ToastProvider';

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

/** 安装前尽量把本机阅读数据推到云端；失败时返回 false */
async function backupBeforeInstall(): Promise<boolean> {
  try {
    const { enqueueLocalReadingMigration, hasLocalReadingData } = await import(
      '@/lib/sync_migrate'
    );
    if (hasLocalReadingData()) enqueueLocalReadingMigration();
    await syncResyncAccount();
    return true;
  } catch {
    return false;
  }
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
  const router = useRouter();
  const toast = useToast();
  const [platform, setPlatform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (platformProp) setPlatform(platformProp);
    else setPlatform(detectInstallPlatform());
  }, [platformProp, open]);

  useEffect(() => {
    if (!open) return;
    const cached = getDeferredInstallPrompt();
    if (cached) setDeferred(cached as BIPEvent);
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
  const loggedIn = Boolean(currentUserId() && hasPassword());
  const isDesktop = platform === 'desktop';

  const dismiss = () => {
    localStorage.setItem(PWA_INSTALL_DISMISS_KEY, '1');
    onClose();
  };

  const goSetAccount = () => {
    onClose();
    router.push('/profile?settings=1');
  };

  const runDesktopInstall = async () => {
    if (!deferred) return;
    if (!loggedIn) {
      toast('请先设置用户名与密码，再保存到桌面 App');
      goSetAccount();
      return;
    }
    setBusy(true);
    try {
      const ok = await backupBeforeInstall();
      if (!ok) {
        toast('读经记录未能保存到账号，请检查网络后再试');
        return;
      }
      await deferred.prompt();
      const choice = await deferred.userChoice;
      setDeferred(null);
      clearDeferredInstallPrompt();
      if (choice.outcome === 'accepted') {
        toast('已保存到桌面 App');
        dismiss();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet card install-pwa-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{isDesktop ? '保存到桌面 App' : '添加到主屏幕'}</strong>
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

        {isDesktop && !loggedIn ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            未设置账号密码时，本机读经记录只留在当前浏览器。重装或清除网站数据后将无法找回，请先设置用户名与密码。
          </p>
        ) : null}

        {isDesktop && loggedIn ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            安装前会把读经记录保存到你的账号。以后重装桌面 App 时，用同一账号登录即可恢复；卸载时请勿勾选「清除网站数据」。
          </p>
        ) : null}

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
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await backupBeforeInstall();
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
                clearDeferredInstallPrompt();
                dismiss();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '正在保存…' : '立即添加'}
          </button>
        ) : null}

        {isDesktop ? (
          loggedIn && deferred ? (
            <button
              type="button"
              className="btn btn-block"
              disabled={busy}
              onClick={() => void runDesktopInstall()}
            >
              {busy ? '正在保存读经记录…' : '保存到桌面 App'}
            </button>
          ) : !loggedIn ? (
            <button type="button" className="btn btn-block" onClick={goSetAccount}>
              先设置账号密码
            </button>
          ) : (
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '8px 0 0' }}>
              请按上方步骤，在浏览器地址栏或菜单中选择「安装彼爱」。安装前请确认已登录。
            </p>
          )
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
          暂不保存
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
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnboardingDone(isOnboardingSeen());
    const onDone = () => setOnboardingDone(true);
    window.addEventListener(ONBOARDING_DONE_EVENT, onDone);
    return () => window.removeEventListener(ONBOARDING_DONE_EVENT, onDone);
  }, []);

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
    if (platform === 'standalone' || isDismissed() || !onboardingDone) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  }, [platform, onboardingDone]);

  if (hidden || !platform || platform === 'standalone' || !onboardingDone) {
    return <InstallPwaSheet open={sheetOpen} onClose={() => setSheetOpen(false)} platform={platform ?? undefined} />;
  }

  const shortMsg =
    platform === 'inapp'
      ? '微信内无法安装，请用浏览器打开'
      : platform === 'ios-safari' || platform === 'ios-other'
        ? '添加到主屏幕，像 App 一样读经'
        : platform === 'desktop'
          ? '登录后，把读经数据保存到桌面 App'
          : '添加到主屏幕，离线也能打开';

  return (
    <>
      <div className="install-banner" role="region" aria-label={platform === 'desktop' ? '保存到桌面 App' : '安装到主屏幕'}>
        <button type="button" className="install-banner-main" onClick={() => setSheetOpen(true)}>
          <span>{shortMsg}</span>
          <span className="install-banner-cta">{platform === 'desktop' ? '去保存' : '查看步骤'}</span>
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
