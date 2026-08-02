'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { openPwaInstallSheet } from '@/components/InstallPwaGuide';
import { BRAND_NAME } from '@/lib/brand';
import { detectInstallPlatform, type InstallPlatform } from '@/lib/pwa_platform';
import {
  copyCurrentPageUrl,
  wechatInstallPrimaryLabel,
  wechatInstallSecondaryHint,
  wechatOpenBrowserToast,
} from '@/lib/wechat_open_browser';
import { hasWechatEscapeIntent } from '@/lib/wechat_escape';
import { useToast } from '@/components/ui/ToastProvider';

type Props = {
  /** 系统浏览器时的主按钮文案 */
  installLabel?: string;
  /** 主路径外的次要链接 */
  secondary?: { href: string; label: string }[];
  /** 解读等：系统浏览器仍可把「继续深度」放主位时，把安装降为次按钮 */
  preferContentPrimary?: boolean;
  contentPrimary?: { label: string; onClick: () => void };
};

/**
 * 分享落地页统一 CTA：微信内主推「复制并用浏览器打开」；
 * 系统浏览器：安卓主推安装 TWA，iOS 主推加主屏幕。
 */
export function ShareLandingCtas({
  installLabel,
  secondary = [{ href: '/', label: `打开${BRAND_NAME}首页` }],
  preferContentPrimary = false,
  contentPrimary,
}: Props) {
  const toast = useToast();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPlatform(detectInstallPlatform());
  }, []);

  if (!platform) return null;

  const resolvedInstallLabel =
    installLabel ??
    (platform === 'android-chrome' || platform === 'android-other'
      ? '下载并安装彼爱'
      : '保存到主屏幕');

  if (platform === 'standalone') {
    return (
      <div className="share-landing-ctas">
        {contentPrimary ? (
          <button type="button" className="btn btn-primary" onClick={contentPrimary.onClick}>
            {contentPrimary.label}
          </button>
        ) : null}
        {secondary.map((s, i) => (
          <Link
            key={s.href + s.label}
            className={i === 0 && !contentPrimary ? 'btn btn-primary' : 'btn'}
            href={s.href}
          >
            {s.label}
          </Link>
        ))}
      </div>
    );
  }

  const onWechatCopy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await copyCurrentPageUrl();
      toast(wechatOpenBrowserToast(ok));
    } finally {
      setBusy(false);
    }
  };

  if (platform === 'inapp') {
    const secondaryLimited = secondary.slice(0, 1);
    return (
      <div className="share-landing-ctas">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void onWechatCopy()}
        >
          {busy ? '复制中…' : wechatInstallPrimaryLabel()}
        </button>
        <p className="muted share-landing-wechat-hint">{wechatInstallSecondaryHint()}</p>
        {contentPrimary ? (
          <button type="button" className="btn" onClick={contentPrimary.onClick}>
            {contentPrimary.label}
          </button>
        ) : null}
        {secondaryLimited.map((s) => (
          <Link key={s.href + s.label} className="btn btn-ghost" href={s.href}>
            {s.label}
          </Link>
        ))}
      </div>
    );
  }

  if (preferContentPrimary && contentPrimary && !hasWechatEscapeIntent()) {
    return (
      <div className="share-landing-ctas">
        <button type="button" className="btn btn-primary" onClick={contentPrimary.onClick}>
          {contentPrimary.label}
        </button>
        <button type="button" className="btn" onClick={() => openPwaInstallSheet()}>
          {resolvedInstallLabel}
        </button>
        {secondary.map((s) => (
          <Link key={s.href + s.label} className="btn btn-ghost" href={s.href}>
            {s.label}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="share-landing-ctas">
      <button type="button" className="btn btn-primary" onClick={() => openPwaInstallSheet()}>
        {resolvedInstallLabel}
      </button>
      {contentPrimary ? (
        <button type="button" className="btn" onClick={contentPrimary.onClick}>
          {contentPrimary.label}
        </button>
      ) : null}
      {secondary.map((s) => (
        <Link key={s.href + s.label} className="btn" href={s.href}>
          {s.label}
        </Link>
      ))}
    </div>
  );
}
