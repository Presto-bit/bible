'use client';

import { useCallback, useEffect, useState } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import {
  EXTERNAL_BROWSER_OPEN,
  openInSystemBrowser,
  type ExternalBrowserOpenDetail,
} from '@/lib/external_browser';

type BrowserState = {
  open: boolean;
  url: string;
  title: string;
  loading: boolean;
};

const CLOSED: BrowserState = { open: false, url: '', title: '', loading: false };

/**
 * 活动外链全屏内嵌浏览器：留在 PWA 壳内，避免 window.open 跳出系统浏览器。
 */
export default function ExternalBrowserSheet() {
  const [state, setState] = useState<BrowserState>(CLOSED);
  const [frameBlocked, setFrameBlocked] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<ExternalBrowserOpenDetail>).detail || {};
      const nextUrl = (detail.url || '').trim();
      setState((prev) => {
        const loading =
          typeof detail.loading === 'boolean'
            ? detail.loading
            : nextUrl
              ? false
              : prev.loading;
        return {
          open: true,
          url: nextUrl || prev.url,
          title: (detail.title || '').trim() || prev.title || '外部页面',
          loading,
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

  const canOpenSystem = Boolean(state.url);

  return (
    <AppBodyPortal>
      <div className="external-browser" role="dialog" aria-modal="true" aria-label={state.title}>
        <header className="external-browser-top">
          <button type="button" className="external-browser-close" onClick={close}>
            关闭
          </button>
          <div className="external-browser-title">{state.title}</div>
          <button
            type="button"
            className="external-browser-system"
            disabled={!canOpenSystem}
            onClick={() => {
              if (!state.url) return;
              openInSystemBrowser(state.url);
            }}
          >
            浏览器打开
          </button>
        </header>

        <div className="external-browser-body">
          {state.loading || !state.url ? (
            <div className="external-browser-loading" aria-live="polite">
              <span className="external-browser-spinner" aria-hidden />
              <p>正在进入…</p>
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
            </div>
          ) : null}
        </div>
      </div>
    </AppBodyPortal>
  );
}
