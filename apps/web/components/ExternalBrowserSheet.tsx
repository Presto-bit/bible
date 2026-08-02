'use client';

import '@/styles/external_browser.css';

import { useCallback, useEffect, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  EXTERNAL_BROWSER_OPEN,
  openInSystemBrowser,
  type ExternalBrowserChrome,
  type ExternalBrowserOpenDetail,
} from '@/lib/external_browser';
import { openCampaignHref, toInternalAppPath } from '@/lib/campaign_nav';

type BrowserState = {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
  chrome: ExternalBrowserChrome;
};

const CLOSED: BrowserState = {
  open: false,
  url: '',
  title: '',
  loading: false,
  chrome: 'app',
};

/**
 * 真外链全屏内嵌浏览器：留在 PWA 壳内。
 * 若事件误带站内 URL，直接同窗跳转，不展示浏览器顶栏。
 * 默认 chrome=app：仅返回+标题；无网址 / 无「浏览器打开」。
 */
export default function ExternalBrowserSheet() {
  const [state, setState] = useState<BrowserState>(CLOSED);
  const [frameBlocked, setFrameBlocked] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ExternalBrowserOpenDetail>).detail || {};
      const nextUrl = (detail.url || '').trim();

      // 站内链接不应进入内嵌浏览器（避免 PWA 套 PWA + 双层壳）
      if (nextUrl && toInternalAppPath(nextUrl)) {
        openCampaignHref(nextUrl);
        return;
      }

      setState((prev) => {
        const loading =
          typeof detail.loading === 'boolean'
            ? detail.loading
            : nextUrl
              ? false
              : prev.loading;
        const chrome =
          detail.chrome === 'browser'
            ? 'browser'
            : detail.chrome === 'app'
              ? 'app'
              : prev.open
                ? prev.chrome
                : 'app';
        return {
          open: true,
          url: nextUrl || prev.url,
          title: (detail.title || '').trim() || prev.title || '网页',
          loading,
          chrome,
        };
      });
      if (nextUrl) setFrameBlocked(false);
    };
    window.addEventListener(EXTERNAL_BROWSER_OPEN, onOpen);
    return () => window.removeEventListener(EXTERNAL_BROWSER_OPEN, onOpen);
  }, []);

  useEffect(() => {
    if (!state.open) return;
    document.documentElement.classList.add('external-browser-open');
    document.body.classList.add('external-browser-open');
    return () => {
      document.documentElement.classList.remove('external-browser-open');
      document.body.classList.remove('external-browser-open');
    };
  }, [state.open]);

  const close = useCallback(() => {
    setState(CLOSED);
    setFrameBlocked(false);
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, close]);

  if (!state.open) return null;

  const appChrome = state.chrome === 'app';
  const hostLabel = (() => {
    if (appChrome) return '';
    try {
      return state.url ? new URL(state.url).hostname.replace(/^www\./, '') : '';
    } catch {
      return '';
    }
  })();

  return (
    <AppBodyPortal>
      <div
        className={`external-browser${appChrome ? ' external-browser--app' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
      >
        <header className="external-browser-top">
          <button type="button" className="external-browser-close" onClick={close} aria-label="返回">
            返回
          </button>
          <div className="external-browser-title-wrap">
            <div className="external-browser-title">
              {state.title === hostLabel ? '网页' : state.title}
            </div>
            {hostLabel ? <div className="external-browser-host">{hostLabel}</div> : null}
          </div>
          {appChrome ? (
            <span className="external-browser-top-spacer" aria-hidden />
          ) : (
            <button
              type="button"
              className="external-browser-system"
              disabled={!state.url || state.loading}
              onClick={() => state.url && openInSystemBrowser(state.url)}
            >
              浏览器打开
            </button>
          )}
        </header>

        <div className="external-browser-body">
          {state.loading || !state.url ? (
            <div className="external-browser-loading" aria-live="polite">
              <span className="external-browser-spinner" aria-hidden />
              <p>正在打开…</p>
            </div>
          ) : (
            <iframe
              key={state.url}
              className="external-browser-frame"
              src={state.url}
              title={state.title}
              allow="fullscreen; clipboard-read; clipboard-write"
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setFrameBlocked(true)}
            />
          )}
          {frameBlocked && state.url ? (
            <div className="external-browser-fallback">
              <p>此页面无法在应用内显示</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openInSystemBrowser(state.url)}
              >
                用浏览器打开
              </button>
              <button type="button" className="text-link" onClick={close}>
                返回
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
