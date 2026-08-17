/** PWA 内嵌外链浏览器：非 React 模块通过事件打开全屏 iframe 层 */

import { isFlutterH5Host, peiaiOpenNative } from '@/lib/flutter_h5_bridge';

export const EXTERNAL_BROWSER_OPEN = 'presto-external-browser-open';

/** app：仅返回+标题（默认）；browser：显示域名与「浏览器打开」（兼容旧调用） */
export type ExternalBrowserChrome = 'app' | 'browser';

export type ExternalBrowserOpenDetail = {
  /** 目标 URL；loading 时可为空，稍后用同事件更新 */
  url?: string;
  title?: string;
  /** 为 true 时显示加载态（创世记取 session 等） */
  loading?: boolean;
  /** 顶栏形态；默认 app */
  chrome?: ExternalBrowserChrome;
};

export function openExternalBrowser(detail: ExternalBrowserOpenDetail): void {
  if (typeof window === 'undefined') return;
  const url = (detail.url || '').trim();
  const title = (detail.title || '').trim() || undefined;
  // Flutter 壳内勿用 iframe 套外链：安卓 System WebView 嵌跨站 SPA 常白屏。
  // 等有真实 URL 再交给原生全屏 WebView（创世记 50 鉴权完成态）。
  if (isFlutterH5Host()) {
    if (!url) return;
    peiaiOpenNative({ type: 'open_external', url, title });
    return;
  }
  window.dispatchEvent(
    new CustomEvent(EXTERNAL_BROWSER_OPEN, {
      detail: {
        url,
        title,
        loading: Boolean(detail.loading),
        chrome: detail.chrome === 'browser' ? 'browser' : 'app',
      } satisfies ExternalBrowserOpenDetail,
    }),
  );
}

export function openInSystemBrowser(url: string): void {
  const raw = (url || '').trim();
  if (!raw || typeof window === 'undefined') return;
  if (isFlutterH5Host()) {
    peiaiOpenNative({ type: 'open_external', url: raw });
    return;
  }
  try {
    // 动态 import 避免 SSR；同步路径优先壳桥
    const w = window as Window & {
      PeiaiShell?: { openExternal?: (u: string) => void };
    };
    if (typeof w.PeiaiShell?.openExternal === 'function') {
      w.PeiaiShell.openExternal(raw);
      return;
    }
  } catch {
    /* fallthrough */
  }
  window.open(raw, '_blank', 'noopener,noreferrer');
}
