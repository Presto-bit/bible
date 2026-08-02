'use client';

import { useEffect, useState } from 'react';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import {
  dismissSharePwaGuide,
  isSharePwaDismissed,
  noteSharePwaShown,
} from '@/lib/share_pwa_guide';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa_platform';
import { BRAND_NAME } from '@/lib/brand';
import {
  copyCurrentPageUrl,
  wechatInstallPrimaryLabel,
  wechatMaskDesc,
  wechatMaskTitle,
  wechatOpenBrowserToast,
} from '@/lib/wechat_open_browser';
import { useToast } from '@/components/ui/ToastProvider';
import { isAndroid } from '@/lib/pwa_platform';

/**
 * 分享落地页安装引导：
 * - 微信等内置浏览器：右上角示意遮罩 + 复制链接（iOS→PWA / 安卓→TWA）
 * - 系统浏览器：底栏打开 InstallPwaSheet
 */
export function SharePwaGuide({
  variant = 'analysis',
}: {
  /** analysis：解读；invite：邀请；daily：每日经文；campaign：活动；wrapped：回顾 */
  variant?: 'analysis' | 'invite' | 'daily' | 'campaign' | 'wrapped';
}) {
  const toast = useToast();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [hidden, setHidden] = useState(true);
  const [ready, setReady] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    const p = detectInstallPlatform();
    setPlatform(p);
    if (p === 'standalone' || isSharePwaDismissed()) {
      setHidden(true);
      return;
    }
    const delay =
      p === 'inapp'
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

  const copyAndHint = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      const ok = await copyCurrentPageUrl();
      toast(wechatOpenBrowserToast(ok));
    } finally {
      setCopyBusy(false);
    }
  };

  if (platform === 'inapp') {
    return (
      <div className="share-wechat-mask" role="dialog" aria-modal="true" aria-labelledby="share-wechat-title">
        <button
          type="button"
          className="share-wechat-mask-scrim"
          aria-label="先看看内容"
          onClick={softDismiss}
        />
        <div className="share-wechat-arrow" aria-hidden>
          <span className="share-wechat-arrow-tip">右上角 ···</span>
          <svg className="share-wechat-arrow-svg" viewBox="0 0 80 96" width="72" height="86">
            <path
              d="M48 8c18 10 26 28 22 52"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path d="M58 52l12 4-8 10" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="share-wechat-card">
          <p id="share-wechat-title" className="share-wechat-title">
            {wechatMaskTitle()}
          </p>
          <p className="share-wechat-desc">{wechatMaskDesc()}</p>
          <button
            type="button"
            className="btn btn-primary share-wechat-cta"
            disabled={copyBusy}
            onClick={() => void copyAndHint()}
          >
            {copyBusy ? '复制中…' : wechatInstallPrimaryLabel()}
          </button>
          <button type="button" className="text-link share-wechat-skip" onClick={softDismiss}>
            先看看内容
          </button>
        </div>
      </div>
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
    ? '下载安装包 · 从桌面打开，不跳应用商店'
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
        {android ? '去安装' : '去保存'}
      </button>
      <button type="button" className="share-pwa-bar-x" onClick={softDismiss} aria-label="关闭">
        ✕
      </button>
    </div>
  );
}
