'use client';

import { useEffect, useState } from 'react';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import {
  dismissSharePwaGuide,
  isSharePwaDismissed,
} from '@/lib/share_pwa_guide';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa_platform';
import { BRAND_NAME } from '@/lib/brand';

/**
 * 分享落地页专用 PWA 引导：
 * - 微信等内置浏览器：顶栏「在浏览器打开」
 * - 系统浏览器：读完后底栏「保存到主屏幕」→ 打开 InstallPwaSheet
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
        ? 400
        : variant === 'invite' || variant === 'daily' || variant === 'campaign' || variant === 'wrapped'
          ? 900
          : 2800;
    const t = window.setTimeout(() => {
      setHidden(false);
      setReady(true);
    }, delay);
    return () => window.clearTimeout(t);
  }, [variant]);

  if (!ready || hidden || !platform || platform === 'standalone') return null;

  const dismiss = () => {
    dismissSharePwaGuide();
    setHidden(true);
  };

  if (platform === 'inapp') {
    return (
      <div className="share-pwa-bar share-pwa-bar-top" role="status">
        <div className="share-pwa-bar-body">
          <p className="share-pwa-bar-title">用浏览器打开，才能保存成 App</p>
          <p className="share-pwa-bar-desc">点右上角 ··· →「在浏览器打开」，再添加到主屏幕</p>
        </div>
        <button type="button" className="share-pwa-bar-x" onClick={dismiss} aria-label="关闭">
          ✕
        </button>
      </div>
    );
  }

  const title =
    variant === 'invite'
      ? `保存${BRAND_NAME}到主屏幕`
      : variant === 'daily'
        ? `喜欢这节经文？保存${BRAND_NAME}到主屏幕`
        : variant === 'campaign'
          ? `想参加？保存${BRAND_NAME}到主屏幕`
          : variant === 'wrapped'
            ? `留下足迹？保存${BRAND_NAME}到主屏幕`
            : `喜欢这段？保存${BRAND_NAME}到主屏幕`;
  const desc =
    variant === 'invite'
      ? '陪你读经，也帮你读懂 · 下次一点就开'
      : variant === 'daily'
        ? '每天一节经文 · 下次一点就开'
        : variant === 'campaign'
          ? '活动提醒与共读 · 下次一点就开'
          : variant === 'wrapped'
            ? '记录你的读经年/月 · 下次一点就开'
            : '下次一点就开 · 离线也能读经';

  return (
    <div className="share-pwa-bar share-pwa-bar-bottom" role="region" aria-label="保存到主屏幕">
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
        去保存
      </button>
      <button type="button" className="share-pwa-bar-x" onClick={dismiss} aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
