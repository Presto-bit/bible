'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { WechatEscapeCoach } from '@/components/WechatEscapeCoach';
import {
  dismissSharePwaGuide,
  isSharePwaDismissed,
  noteSharePwaShown,
} from '@/lib/share_pwa_guide';
import { useIosAddToHomeGuide } from '@/lib/ios_home_screen_guide';
import { detectInstallPlatform, isAndroid, type InstallPlatform } from '@/lib/pwa_platform';
import {
  getInstallCoachVisible,
  isAndroidAutoInstallDismissedThisLoad,
  isAndroidTwaInstallClaimed,
  isIosAutoInstallDismissedThisLoad,
  subscribeInstallCoachVisible,
} from '@/lib/pwa_install_prompt';

/**
 * 分享落地页安装引导：
 * - 微信等内置浏览器：只催逃逸（WechatEscapeCoach）
 * - 系统浏览器：底栏打开 InstallPwaSheet / iOS 指尖引导
 */
export function SharePwaGuide({
  variant = 'analysis',
}: {
  /** analysis：解读；invite：邀请；daily：每日经文；campaign：活动；wrapped：回顾；shelf：书架 */
  variant?: 'analysis' | 'invite' | 'daily' | 'campaign' | 'wrapped' | 'shelf';
}) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [hidden, setHidden] = useState(true);
  const [ready, setReady] = useState(false);
  const iosGuide = useIosAddToHomeGuide();
  const coachVisible = useSyncExternalStore(
    subscribeInstallCoachVisible,
    getInstallCoachVisible,
    () => false,
  );

  useEffect(() => {
    const p = detectInstallPlatform();
    setPlatform(p);
    if (p === 'standalone' || isSharePwaDismissed()) {
      setHidden(true);
      return;
    }
    const delay =
      p === 'inapp'
        ? 160
        : p === 'android-chrome' || p === 'android-other'
          ? 280
          : variant === 'invite'
            || variant === 'daily'
            || variant === 'campaign'
            || variant === 'wrapped'
            || variant === 'shelf'
            ? 900
            : 2800;
    const t = window.setTimeout(() => {
      noteSharePwaShown();
      setHidden(false);
      setReady(true);
    }, delay);
    return () => window.clearTimeout(t);
  }, [variant]);

  if (!platform || platform === 'standalone') return null;

  const softDismiss = () => {
    dismissSharePwaGuide();
    setHidden(true);
  };

  if (platform === 'inapp') {
    if (!ready || hidden) return null;
    return (
      <WechatEscapeCoach
        softCloseOnly
        skipLabel="收起"
        /* 收起不写 1 天冷却、不卸载；粘性条可再开全屏指引 */
        onDismissPassive={softDismiss}
        onSoftClose={() => {
          /* no-op：由 WechatEscapeCoach 内部最小化 */
        }}
      />
    );
  }

  const android = isAndroid();
  const ios =
    platform === 'ios-safari' || platform === 'ios-other';
  if (android && isAndroidTwaInstallClaimed()) return null;
  if (ios || android) {
    const coachDismissed = ios
      ? isIosAutoInstallDismissedThisLoad()
      : isAndroidAutoInstallDismissedThisLoad();
    // 教练在时页面已经打开；关掉之后才留一条，避免两层提示
    if (coachVisible || !coachDismissed) return null;
  }

  if (!ready || hidden) return null;

  const title = android ? '安装彼爱' : ios ? '添加到主屏幕' : '安装彼爱';
  const desc = android
    ? '装好后，在桌面打开「彼爱」'
    : ios
      ? iosGuide.summary
      : '在浏览器菜单里安装';
  const cta = android ? '下载安装包' : ios ? '看怎么添加' : '去安装';

  return (
    <div className="share-pwa-bar share-pwa-bar-bottom" role="region" aria-label={title}>
      <button
        type="button"
        className="share-pwa-bar-main"
        onClick={() => {
          openPwaInstallSheet();
        }}
      >
        <span className="share-pwa-bar-title">{title}</span>
        <span className="share-pwa-bar-desc">{desc}</span>
      </button>
      <button type="button" className="btn share-pwa-bar-cta" onClick={() => openPwaInstallSheet()}>
        {cta}
      </button>
      <button type="button" className="share-pwa-bar-x" onClick={softDismiss} aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
