'use client';

import { useEffect, useState } from 'react';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { WechatEscapeCoach } from '@/components/WechatEscapeCoach';
import {
  dismissSharePwaGuide,
  isSharePwaDismissed,
  noteSharePwaShown,
} from '@/lib/share_pwa_guide';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa_platform';
import { BRAND_NAME } from '@/lib/brand';
import { isAndroid } from '@/lib/pwa_platform';

/**
 * 分享落地页安装引导：
 * - 微信等内置浏览器：只催逃逸（WechatEscapeCoach）
 * - 系统浏览器：底栏打开 InstallPwaSheet / iOS 指尖引导
 */
export function SharePwaGuide({
  variant = 'analysis',
}: {
  /** analysis：解读；invite：邀请；daily：每日经文；campaign：活动；wrapped：回顾 */
  variant?: 'analysis' | 'invite' | 'daily' | 'campaign' | 'wrapped';
}) {
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [hidden, setHidden] = useState(true);
  const [ready, setReady] = useState(false);

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
          : variant === 'invite' || variant === 'daily' || variant === 'campaign' || variant === 'wrapped'
            ? 900
            : 2800;
    const t = window.setTimeout(() => {
      noteSharePwaShown();
      setHidden(false);
      setReady(true);
    }, delay);
    return () => window.clearTimeout(t);
  }, [variant]);

  if (!ready || hidden || !platform || platform === 'standalone') return null;

  const softDismiss = () => {
    dismissSharePwaGuide();
    setHidden(true);
  };

  if (platform === 'inapp') {
    return (
      <WechatEscapeCoach
        softCloseOnly
        skipLabel="先看看内容"
        /* 收起不写 1 天冷却、不卸载；粘性条可再开全屏指引 */
        onDismissPassive={softDismiss}
        onSoftClose={() => {
          /* no-op：由 WechatEscapeCoach 内部最小化 */
        }}
      />
    );
  }

  const android = isAndroid();
  const title = android
    ? variant === 'invite'
      ? `安装${BRAND_NAME}，一起读`
      : variant === 'daily'
        ? `喜欢这节？安装${BRAND_NAME}`
        : variant === 'campaign'
          ? `想参加？先安装${BRAND_NAME}`
          : variant === 'wrapped'
            ? `留下足迹？安装${BRAND_NAME}`
            : `喜欢这段？安装${BRAND_NAME}`
    : variant === 'invite'
      ? `保存${BRAND_NAME}到主屏幕`
      : variant === 'daily'
        ? `喜欢这节经文？保存${BRAND_NAME}到主屏幕`
        : variant === 'campaign'
          ? `想参加？保存${BRAND_NAME}到主屏幕`
          : variant === 'wrapped'
            ? `留下足迹？保存${BRAND_NAME}到主屏幕`
            : `喜欢这段？保存${BRAND_NAME}到主屏幕`;
  const desc = android
    ? '下载安装包安装 · 比「添加到主屏幕」更稳'
    : variant === 'invite'
      ? '陪你读经，也帮你读懂 · 下次一点就开'
      : variant === 'daily'
        ? '每天一节经文 · 下次一点就开'
        : variant === 'campaign'
          ? '活动提醒与共读 · 下次一点就开'
          : variant === 'wrapped'
            ? '记录你的读经年/月 · 下次一点就开'
            : '下次一点就开 · 离线也能读经';

  return (
    <div className="share-pwa-bar share-pwa-bar-bottom" role="region" aria-label={android ? '安装彼爱' : '保存到主屏幕'}>
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
        {android ? '去安装' : '看怎么保存'}
      </button>
      <button type="button" className="share-pwa-bar-x" onClick={softDismiss} aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
