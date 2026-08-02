'use client';

import '@/styles/pwa_install.css';

import { useState } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import { PWA_HOME_NAME } from '@/lib/pwa_brand';
import { isAndroid, isIOS } from '@/lib/pwa_platform';
import {
  copyCurrentPageUrl,
  wechatOpenBrowserToast,
} from '@/lib/wechat_open_browser';
import { useToast } from '@/components/ui/ToastProvider';

type Props = {
  /** 分享落地：点遮罩/跳过只关本次，不写全站冷却 */
  softCloseOnly?: boolean;
  skipLabel?: string;
  onDismissPassive: () => void;
  onSoftClose: () => void;
};

/**
 * 微信 / QQ 内置浏览器：只做一件事——逃到系统浏览器。
 * 安装 / 加主屏幕等出微信后再引导。
 */
export function WechatEscapeCoach({
  softCloseOnly = false,
  skipLabel = '先看看内容',
  onDismissPassive,
  onSoftClose,
}: Props) {
  const toast = useToast();
  const [copyBusy, setCopyBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const iconSrc = `${BASE_PATH || ''}/apple-touch-icon.png`;
  const ios = isIOS();
  const android = isAndroid();
  const browserName = ios ? 'Safari' : android ? '浏览器' : '浏览器';
  const openLabel = ios ? '在 Safari 打开' : '在浏览器打开';

  const onCopy = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      const ok = await copyCurrentPageUrl();
      setCopied(ok);
      toast(wechatOpenBrowserToast(ok));
    } finally {
      setCopyBusy(false);
    }
  };

  const onSkip = () => {
    if (softCloseOnly) onSoftClose();
    else onDismissPassive();
  };

  return (
    <div
      className="wechat-escape-coach"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wechat-escape-title"
    >
      <button
        type="button"
        className="wechat-escape-scrim"
        aria-label={skipLabel}
        onClick={onSoftClose}
      />

      <div className="wechat-escape-arrow" aria-hidden>
        <span className="wechat-escape-arrow-tip">右上角 ···</span>
        <svg className="wechat-escape-arrow-svg" viewBox="0 0 80 96" width="72" height="86">
          <path
            d="M48 8c18 10 26 28 22 52"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M58 52l12 4-8 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="wechat-escape-body">
        <div className="wechat-escape-card">
          <div className="wechat-escape-brand">
            <img src={iconSrc} alt="" width={44} height={44} className="wechat-escape-icon" />
            <div>
              <strong id="wechat-escape-title" className="wechat-escape-name">
                {PWA_HOME_NAME}
              </strong>
              <span className="muted wechat-escape-sub">微信里无法完成安装</span>
            </div>
          </div>

          <p className="wechat-escape-headline">
            {copied ? `链接已复制 · 现在点右上角 ···` : `先在${browserName}打开`}
          </p>

          <p className="wechat-escape-path" aria-label="操作路径">
            <span>···</span>
            <span className="wechat-escape-path-sep" aria-hidden>
              →
            </span>
            <span>{openLabel}</span>
          </p>

          <p className="muted wechat-escape-hint">
            {copied
              ? `选「${openLabel}」即可；打开后会继续下一步`
              : '只做这一步。打开后再教你安装 / 保存到主屏幕'}
          </p>

          <button
            type="button"
            className={`btn btn-block wechat-escape-cta${copied ? ' wechat-escape-cta-done' : ''}`}
            disabled={copyBusy}
            onClick={() => void onCopy()}
          >
            {copyBusy ? '复制中…' : copied ? '已复制，去点右上角 ···' : '没有该选项？复制链接备用'}
          </button>

          <button type="button" className="text-link wechat-escape-skip" onClick={onSkip}>
            {skipLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
