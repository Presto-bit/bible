/** 安卓壳深链 / 系统返回：走 SPA，避免 WebView loadUrl / 盲目 goBack */

import { navigateAppHref } from './pwa_tab_nav';
import { isDiscoverShellBackPath } from './im_session_gate';

type ShellRouter = { push: (url: string, options?: { scroll?: boolean }) => void };

declare global {
  interface Window {
    __peiaiShellNavReady?: boolean;
    __peiaiShellBack?: () => boolean;
  }
}

function pathFromShellHref(href: string): string {
  const raw = (href || '').trim();
  if (!raw) return '/';
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      return `${u.pathname}${u.search}${u.hash}` || '/';
    }
  } catch {
    /* ignore */
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * 注册壳导航桥。返回 cleanup。
 * 原生通过 CustomEvent('peiai-shell-navigate') / __peiaiShellBack 调用。
 */
export function initShellNavBridge(router: ShellRouter): () => void {
  if (typeof window === 'undefined') return () => {};

  window.__peiaiShellNavReady = true;
  window.__peiaiShellBack = () => {
    if (!isDiscoverShellBackPath()) return false;
    navigateAppHref('/discover', router);
    return true;
  };

  const onNavigate = (ev: Event) => {
    const detail = (ev as CustomEvent<{ href?: string; url?: string }>).detail;
    const href = pathFromShellHref(detail?.href || detail?.url || '');
    if (!href) return;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (cur === href) return;
    navigateAppHref(href, router);
  };

  window.addEventListener('peiai-shell-navigate', onNavigate as EventListener);
  return () => {
    window.removeEventListener('peiai-shell-navigate', onNavigate as EventListener);
    window.__peiaiShellNavReady = false;
    window.__peiaiShellBack = undefined;
  };
}
