'use client';

import '@/styles/pwa_install.css';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SheetCloseButton } from '@/components/PageBackBar';
import AppBodyPortal from '@/components/AppBodyPortal';
import { PWA_HOME_NAME, PWA_HOME_SUBTITLE } from '@/lib/pwa_brand';
import {
  detectInstallPlatform,
  installHeadline,
  installSteps,
  isIOS,
  type InstallPlatform,
} from '@/lib/pwa_platform';
import { BASE_PATH } from '@/lib/basePath';
import {
  getDeferredInstallPrompt,
  clearDeferredInstallPrompt,
} from '@/lib/pwa_deferred_prompt';
import { isOnboardingSeen, ONBOARDING_DONE_EVENT } from '@/lib/onboarding';
import {
  HOME_ONBOARDING_DISMISS_EVENT,
  isHomeOnboardingDismissed,
  resolveHomeOnboarding,
} from '@/lib/home_onboarding';
import { syncResyncAccount } from '@/lib/sync';
import { hasPassword, currentUserId } from '@/lib/api';
import { useToast } from '@/components/ui/ToastProvider';
import { isTabKeepAliveEnabled } from '@/lib/platform';
import {
  getPwaTabPathname,
  resolvePwaPathname,
  subscribePwaTabNav,
} from '@/lib/pwa_tab_nav';
import { normalizeAppPath } from '@/lib/tab_keep_alive';
import { isShareLandingPath } from '@/lib/share_pwa_guide';
import {
  clearInstallPromptDismiss,
  dismissAndroidAutoInstallThisLoad,
  dismissInstallPrompt,
  getAndroidAutoSheetOpen,
  isAndroidInstallAutoSuppressed,
  isAndroidTwaInstallClaimed,
  isInstallPromptSuppressed,
  markAndroidTwaInstallClaimed,
  noteInstallPromptShown,
  PWA_INSTALL_DISMISS_KEY,
  setAndroidAutoSheetOpen,
} from '@/lib/pwa_install_prompt';
import {
  readPwaInstallContext,
  writePwaInstallContext,
  type PwaInstallContext,
} from '@/lib/pwa_after_read';
import {
  detectAndroidTwaInstalled,
} from '@/lib/android_twa';
import { androidPackageDownloadHref } from '@/lib/app_package_settings';
import { isFlutterH5Host } from '@/lib/flutter_h5_bridge';
import { IosSafariInstallCoach } from '@/components/IosSafariInstallCoach';
import { WechatEscapeCoach } from '@/components/WechatEscapeCoach';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

export { PWA_INSTALL_DISMISS_KEY };
export const PWA_INSTALL_SHEET_EVENT = 'presto-pwa-install-open';

export function openPwaInstallSheet(ctx?: PwaInstallContext) {
  if (ctx) writePwaInstallContext(ctx);
  window.dispatchEvent(
    new CustomEvent(PWA_INSTALL_SHEET_EVENT, { detail: ctx ?? null }),
  );
}

/** 安装前尽量把本机阅读数据推到云端；失败时返回 false */
async function backupBeforeInstall(): Promise<boolean> {
  try {
    const { enqueueLocalReadingMigration, hasLocalReadingData } = await import(
      '@/lib/sync_migrate'
    );
    if (hasLocalReadingData()) enqueueLocalReadingMigration();
    await syncResyncAccount();
    const { backupLocalReadingSnapshot } = await import('@/lib/reading_durable');
    await backupLocalReadingSnapshot();
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
  context,
}: {
  open: boolean;
  onClose: () => void;
  platform?: InstallPlatform;
  /** 有效读经后等场景：带续读经节 */
  context?: PwaInstallContext | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [platform, setPlatform] = useState<InstallPlatform>(() => detectInstallPlatform());
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [androidInstalled, setAndroidInstalled] = useState(false);
  const installCtx = context ?? readPwaInstallContext();
  const resumeLabel = installCtx?.resumeLabel?.trim() || '';

  useEffect(() => {
    if (platformProp) setPlatform(platformProp);
    else setPlatform(detectInstallPlatform());
  }, [platformProp, open]);

  useEffect(() => {
    if (!open) return;
    const p = platformProp ?? detectInstallPlatform();
    if (p === 'android-chrome' || p === 'android-other') {
      void detectAndroidTwaInstalled().then(setAndroidInstalled);
    } else {
      setAndroidInstalled(false);
    }
  }, [open, platformProp]);

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
  const isAndroid = platform === 'android-chrome' || platform === 'android-other';
  const isInApp = platform === 'inapp';
  const isIosSafari = platform === 'ios-safari';
  const sheetTitle = isDesktop
    ? '保存到桌面 App'
    : isAndroid || (isInApp && !isIOS())
      ? '下载安装包'
      : '添加到主屏幕';

  /** 分享落地 / 微信 / 安卓自动安装：关闭只关本页，不写 2 天冷却（刷新后可再出） */
  const softCloseOnly =
    isAndroid ||
    platform === 'inapp' ||
    isShareLandingPath(
      typeof window !== 'undefined' ? window.location.pathname : '',
    );

  const dismissPassive = () => {
    dismissInstallPrompt();
    onClose();
  };

  const softClose = () => {
    onClose();
  };

  if (isIosSafari) {
    return (
      <IosSafariInstallCoach
        resumeLabel={resumeLabel}
        softCloseOnly={softCloseOnly}
        onDismissPassive={dismissPassive}
        onSoftClose={softClose}
      />
    );
  }

  if (isInApp) {
    return (
      <WechatEscapeCoach
        softCloseOnly={softCloseOnly}
        skipLabel={softCloseOnly ? '先看看内容' : '暂不打开'}
        onDismissPassive={dismissPassive}
        /* 收起保留引导（粘性条）；勿关 Sheet，避免卸载 */
        onSoftClose={() => {
          /* no-op：WechatEscapeCoach 内部最小化 */
        }}
      />
    );
  }

  const goSetAccount = () => {
    dismissInstallPrompt();
    onClose();
    router.push('/profile/settings');
  };

  const onInstallAccepted = async () => {
    try {
      const { clearSharePwaDismiss } = await import('@/lib/share_pwa_guide');
      clearSharePwaDismiss();
    } catch {
      /* ignore */
    }
    if (isAndroid) {
      // 仅关本页自动层；下载 ≠ 已安装，刷新后未装仍弹
      dismissAndroidAutoInstallThisLoad();
    } else {
      clearInstallPromptDismiss();
    }
    onClose();
  };

  const runDesktopInstall = async () => {
    if (!deferred) return;
    if (!loggedIn) {
      toast('请先设置密码，再保存到桌面 App');
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
        await onInstallAccepted();
      }
    } finally {
      setBusy(false);
    }
  };

  const runAndroidApkInstall = async () => {
    setBusy(true);
    try {
      await backupBeforeInstall();
      toast('开始下载安装包…装好后请打开桌面「彼爱」；若未安装完成，刷新页面会再次提醒。');
      window.location.href = androidPackageDownloadHref();
      // 不 hard-claim：用户可能只下了文件没装完
      await onInstallAccepted();
    } finally {
      setBusy(false);
    }
  };

  const markAlreadyInstalled = () => {
    markAndroidTwaInstallClaimed();
    toast('已标记为本机已安装，不再自动提醒');
    onClose();
  };

  return (
    <AppBodyPortal onTabAway={softClose}>
    <div className="sheet-backdrop" data-dismiss-on-tab-nav onClick={softClose}>
      <div className="sheet card install-pwa-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>{sheetTitle}</strong>
          <SheetCloseButton onClick={softClose} />
        </div>

        <div className="install-pwa-brand">
          <img
            src={
              isAndroid
                ? `${BASE_PATH || ''}/downloads/biai-android-icon-192.png`
                : iconSrc
            }
            alt=""
            width={72}
            height={72}
            className="install-pwa-icon"
            onError={(e) => {
              (e.target as HTMLImageElement).src = iconSrc;
            }}
          />
          <div>
            <strong className="install-pwa-name">{PWA_HOME_NAME}</strong>
            <span className="muted install-pwa-sub">
              {isAndroid ? '官方安装包 · 不跳应用商店' : PWA_HOME_SUBTITLE}
            </span>
          </div>
        </div>

        <p className="install-pwa-headline">
          {resumeLabel && !isDesktop
            ? isAndroid
              ? `安装后一键续读 · ${resumeLabel}`
              : `下次从主屏幕一键续读 · ${resumeLabel}`
            : installHeadline(platform)}
        </p>

        {resumeLabel && !isDesktop ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            {isAndroid
              ? '安装完成后打开桌面「彼爱」图标，即可回到刚才读的地方。'
              : '保存到主屏幕后，打开图标即可回到刚才读的地方。'}
          </p>
        ) : null}
        {isAndroid ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            安装前会尽量把读经记录保存到账号。请下载官方 Flutter 安装包（不跳应用商店、无需 Chrome），装好后用桌面「彼爱」打开。
            暂不安装可继续浏览；未装完关闭本提示后，刷新页面会再次提醒。
          </p>
        ) : null}
        {isDesktop && !loggedIn ? (
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' }}>
            未设置密码时，本机读经记录只留在当前浏览器。重装或清除网站数据后将无法找回，请先设置密码（建议绑定手机）。
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

        {isAndroid ? (
          androidInstalled ? (
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: '8px 0 0' }}>
              本机可能已安装彼爱。请优先打开桌面「彼爱」；若需重装可再下载安装包。
            </p>
          ) : null
        ) : null}

        {isAndroid ? (
          <button
            type="button"
            className="btn btn-block"
            disabled={busy}
            onClick={() => void runAndroidApkInstall()}
          >
            {busy ? '正在保存读经记录…' : androidInstalled ? '重新下载安装包' : '下载并安装'}
          </button>
        ) : null}

        {isAndroid && !androidInstalled ? (
          <button
            type="button"
            className="text-link install-pwa-dismiss"
            style={{ marginTop: 8 }}
            onClick={markAlreadyInstalled}
          >
            我已安装，不再提示
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

        <button
          type="button"
          className="text-link install-pwa-dismiss"
          onClick={() => {
            if (softCloseOnly) {
              softClose();
              return;
            }
            dismissPassive();
          }}
        >
          {isAndroid ? '暂不安装' : '暂不保存'}
        </button>
      </div>
    </div>
    </AppBodyPortal>
  );
}

/** 底部轻量 Banner：点击展开完整引导；与首页任务横幅错开；暂不=短冷却+本会话不再出 */
export default function InstallBanner() {
  const routerPath = usePathname();
  const pwaPath = useSyncExternalStore(
    subscribePwaTabNav,
    getPwaTabPathname,
    () => '/',
  );
  const pathname = isTabKeepAliveEnabled()
    ? resolvePwaPathname(routerPath, pwaPath)
    : normalizeAppPath(routerPath || '/');
  const onHome = pathname === '/';
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [sheetOpen, setSheetOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    // 仅硬认领阻止首帧自动层；2 天冷却 / session 不挡安卓
    if (isAndroidTwaInstallClaimed()) return false;
    return getAndroidAutoSheetOpen();
  });
  const [sheetCtx, setSheetCtx] = useState<PwaInstallContext | null>(null);
  const [hidden, setHidden] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [homeClear, setHomeClear] = useState(false);
  /** 探测/硬认领已装 → 禁止安卓自动 Sheet */
  const [androidInstalled, setAndroidInstalled] = useState(
    () => (typeof window !== 'undefined' ? isAndroidTwaInstallClaimed() : false),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnboardingDone(isOnboardingSeen());
    const onDone = () => setOnboardingDone(true);
    window.addEventListener(ONBOARDING_DONE_EVENT, onDone);
    return () => window.removeEventListener(ONBOARDING_DONE_EVENT, onDone);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const refreshHome = () => {
      if (isHomeOnboardingDismissed()) {
        if (!cancelled) setHomeClear(true);
        return;
      }
      void resolveHomeOnboarding().then((s) => {
        if (!cancelled) setHomeClear(s.stage === 'S3');
      });
    };
    refreshHome();
    window.addEventListener(HOME_ONBOARDING_DISMISS_EVENT, refreshHome);
    window.addEventListener('presto-offline-pack-ready', refreshHome);
    return () => {
      cancelled = true;
      window.removeEventListener(HOME_ONBOARDING_DISMISS_EVENT, refreshHome);
      window.removeEventListener('presto-offline-pack-ready', refreshHome);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setPlatform(detectInstallPlatform());
    sync();
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<PwaInstallContext | null>).detail;
      if (detail) setSheetCtx(detail);
      else setSheetCtx(readPwaInstallContext());
      // 主动打开：不走 auto 态，claimed 后仍可进引导
      setAndroidAutoSheetOpen(false);
      setSheetOpen(true);
    };
    window.addEventListener(PWA_INSTALL_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(PWA_INSTALL_SHEET_EVENT, onOpen);
  }, []);

  // 首页有任务横幅时让路；分享落地页改用 SharePwaGuide，隐藏全站 Banner
  const onShareLanding = isShareLandingPath(pathname);
  const slotFree = (homeClear || !onHome) && !onShareLanding;
  const isAndroidBrowser =
    platform === 'android-chrome' || platform === 'android-other';
  /** 安卓系统浏览器 + 微信等内置浏览器（安卓微信走 APK 引导） */
  const isAndroidPlatform =
    isAndroidBrowser || (platform === 'inapp' && !isIOS());

  // 安卓浏览器/微信：进入即弹装包；关只本页；未硬认领则刷新再弹
  useEffect(() => {
    if (platform === null) return;
    if (platform === 'standalone') {
      setHidden(true);
      setSheetOpen(false);
      setAndroidAutoSheetOpen(false);
      return;
    }
    if (isAndroidPlatform) {
      if (androidInstalled || isAndroidInstallAutoSuppressed()) {
        setHidden(true);
        // 仅关掉「自动」Sheet，不挡主动 openPwaInstallSheet
        if (getAndroidAutoSheetOpen()) {
          setAndroidAutoSheetOpen(false);
          setSheetOpen(false);
        }
        return;
      }
      // 切 Tab 时若本页仍保持「打开中」则恢复
      if (getAndroidAutoSheetOpen()) {
        setHidden(false);
        setSheetOpen(true);
        return;
      }
      const t = window.setTimeout(() => {
        if (androidInstalled || isAndroidInstallAutoSuppressed()) return;
        // 不写 session / 2 天冷却，保证刷新可再弹
        setAndroidAutoSheetOpen(true);
        setHidden(false);
        setSheetOpen(true);
      }, platform === 'inapp' ? 180 : 250);
      return () => window.clearTimeout(t);
    }
    if (isInstallPromptSuppressed() || !onboardingDone || !slotFree) {
      setHidden(true);
      return;
    }
    const t = window.setTimeout(() => {
      noteInstallPromptShown();
      setHidden(false);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [platform, onboardingDone, slotFree, isAndroidPlatform, androidInstalled]);

  // 探测到已装 → 硬认领，永久关掉自动 Sheet
  useEffect(() => {
    if (!isAndroidPlatform) return;
    let cancelled = false;
    if (isAndroidTwaInstallClaimed()) {
      setAndroidInstalled(true);
      return;
    }
    void detectAndroidTwaInstalled().then((ok) => {
      if (cancelled || !ok) return;
      markAndroidTwaInstallClaimed();
      setAndroidInstalled(true);
      setSheetOpen(false);
      setAndroidAutoSheetOpen(false);
      setHidden(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAndroidPlatform]);

  const closeSheet = () => {
    if (isAndroidPlatform) {
      // 只关本页自动弹；不写 2 天冷却 → 刷新仍可再弹
      dismissAndroidAutoInstallThisLoad();
    }
    setSheetOpen(false);
    setSheetCtx(null);
    writePwaInstallContext(null);
    if (isAndroidPlatform) setHidden(true);
    else if (isInstallPromptSuppressed()) setHidden(true);
  };

  const afterReadLabel = sheetCtx?.resumeLabel || readPwaInstallContext()?.resumeLabel;

  // Flutter 嵌 H5：已是 App 内，禁止任何安装引导
  if (typeof window !== 'undefined' && isFlutterH5Host()) {
    return null;
  }

  // 分享落地仍可响应 openPwaInstallSheet()；standalone 永不自动引导
  if (onShareLanding) {
    return (
      <InstallPwaSheet
        open={sheetOpen}
        onClose={closeSheet}
        platform={platform ?? undefined}
        context={sheetCtx}
      />
    );
  }

  // 安卓自动 Sheet：不依赖 Banner 槽位（isAndroidPlatform 已排除 standalone）
  if (isAndroidPlatform) {
    return (
      <InstallPwaSheet
        open={sheetOpen}
        onClose={closeSheet}
        platform={platform ?? undefined}
        context={sheetCtx}
      />
    );
  }

  if (hidden || !platform || platform === 'standalone' || !onboardingDone || !slotFree) {
    return (
      <InstallPwaSheet
        open={sheetOpen}
        onClose={closeSheet}
        platform={platform ?? undefined}
        context={sheetCtx}
      />
    );
  }

  const shortMsg =
    afterReadLabel && platform !== 'desktop'
      ? `下次一键续读 · ${afterReadLabel}`
      : platform === 'inapp'
        ? '微信里装不了 · 先用浏览器打开'
        : platform === 'ios-safari' || platform === 'ios-other'
          ? '保存到主屏幕，约 10 秒'
          : platform === 'desktop'
            ? '登录后，把读经数据保存到桌面 App'
            : '下载安装包，装好更稳';

  return (
    <>
      <div className="install-banner" role="region" aria-label={platform === 'desktop' ? '保存到桌面 App' : '安装彼爱'}>
        <button type="button" className="install-banner-main" onClick={() => setSheetOpen(true)}>
          <span>{shortMsg}</span>
          <span className="install-banner-cta">
            {platform === 'desktop'
              ? '去保存'
              : platform === 'ios-safari' || platform === 'ios-other'
                ? '看怎么保存'
                : '去安装'}
          </span>
        </button>
        <button
          type="button"
          className="install-banner-close"
          onClick={() => {
            dismissInstallPrompt();
            writePwaInstallContext(null);
            setHidden(true);
          }}
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <InstallPwaSheet
        open={sheetOpen}
        onClose={closeSheet}
        platform={platform}
        context={sheetCtx}
      />
    </>
  );
}
