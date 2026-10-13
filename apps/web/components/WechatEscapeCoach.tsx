'use client';

import '@/styles/pwa_install.css';

import { useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/basePath';
import { PWA_HOME_NAME } from '@/lib/pwa_brand';
import { isAndroid, isIOS } from '@/lib/pwa_platform';
import {
  copyCurrentPageUrl,
  wechatOpenBrowserToast,
} from '@/lib/wechat_open_browser';
import { primeCurrentUrlForWechatEscape } from '@/lib/wechat_escape';
import { useToast } from '@/components/ui/ToastProvider';

type Props = {
  /** 分享落地：点遮罩/跳过只关本次，不写全站冷却 */
  softCloseOnly?: boolean;
  skipLabel?: string;
  onDismissPassive: () => void;
  /**
   * 收起为粘性条时调用。
   * 强化逃逸：不应卸载本组件；父级 onSoftClose 宜 no-op 或仅记状态。
   */
  onSoftClose: () => void;
};

/**
 * 微信 / QQ 内置浏览器：只做一件事——逃到系统浏览器。
 * 不在这里讲安装。安装等系统浏览器打开这篇之后再说。
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
  const [phase, setPhase] = useState<'coach' | 'chip'>('coach');
  const primed = useRef(false);
  const autoCopied = useRef(false);
  const iconSrc = `${BASE_PATH || ''}/apple-touch-icon.png`;
  const ios = isIOS();
  const android = isAndroid();
  const browserName = ios ? 'Safari' : '浏览器';
  const openLabel = ios ? '在 Safari 打开' : '在浏览器打开';

  useEffect(() => {
    if (primed.current) return;
    primed.current = true;
    primeCurrentUrlForWechatEscape();
  }, []);

  // 入场自动复制一次，降低「还要再点复制」的摩擦
  useEffect(() => {
    if (autoCopied.current) return;
    autoCopied.current = true;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const ok = await copyCurrentPageUrl();
        if (cancelled) return;
        if (ok) {
          setCopied(true);
          toast(
            android
              ? '链接已就绪 · 点右上角 ··· →「在浏览器打开」'
              : '链接已就绪 · 点右上角 ··· →「在 Safari 打开」',
          );
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [android, toast]);

  const onCopy = async () => {
    if (copyBusy) return;
    setCopyBusy(true);
    try {
      primeCurrentUrlForWechatEscape();
      const ok = await copyCurrentPageUrl();
      setCopied(ok);
      toast(wechatOpenBrowserToast(ok));
    } finally {
      setCopyBusy(false);
    }
  };

  const minimize = () => {
    setPhase('chip');
    onSoftClose();
  };

  const expand = () => {
    primeCurrentUrlForWechatEscape();
    setPhase('coach');
  };

  const onSkip = () => {
    if (softCloseOnly) {
      minimize();
      return;
    }
    onDismissPassive();
  };

  if (phase === 'chip') {
    return (
      <div className="wechat-escape-chip-wrap" role="region" aria-label="用浏览器打开">
        <button type="button" className="wechat-escape-chip" onClick={expand}>
          <span className="wechat-escape-chip-dot" aria-hidden />
          <span className="wechat-escape-chip-text">
            {android ? '点右上角 ···，在浏览器打开' : '点右上角 ···，在 Safari 打开'}
          </span>
          <span className="wechat-escape-chip-cta">打开指引</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="wechat-escape-coach"
      role="dialog"
      aria-labelledby="wechat-escape-title"
    >
      <div className="wechat-escape-arrow" aria-hidden>
        <span className="wechat-escape-arrow-tip">点这里 ···</span>
        <svg className="wechat-escape-arrow-svg" viewBox="0 0 80 96" width="76" height="90">
          <path
            d="M48 8c18 10 26 28 22 52"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M58 52l12 4-8 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
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
              <span className="muted wechat-escape-sub">
                {android ? '微信里下不了安装包' : '微信里加不了主屏幕'}
              </span>
            </div>
          </div>

          <p className="wechat-escape-headline">点右上角 ···</p>

          <ol className="wechat-escape-steps" aria-label="操作步骤">
            <li>
              <span className="wechat-escape-step-n">1</span>
              <span>
                点右上角 <strong>···</strong>
              </span>
            </li>
            <li>
              <span className="wechat-escape-step-n">2</span>
              <span>
                选「<strong>{openLabel}</strong>」
              </span>
            </li>
          </ol>

          <p className="muted wechat-escape-hint">
            {copied
              ? `链接已复制，也可粘贴到${browserName}。打开后就是这篇。`
              : '打开后就是这篇，不用再确认一次。'}
          </p>

          <button
            type="button"
            className={`btn btn-block wechat-escape-cta${copied ? ' wechat-escape-cta-done' : ''}`}
            disabled={copyBusy}
            onClick={() => void onCopy()}
          >
            {copyBusy
              ? '复制中…'
              : copied
                ? '已复制 · 去点右上角 ···'
                : `复制链接备用（用${browserName}打开）`}
          </button>

          <button type="button" className="text-link wechat-escape-skip" onClick={onSkip}>
            {skipLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
