/** PWA 内嵌外链浏览器：非 React 模块通过事件打开全屏 iframe 层 */

export const EXTERNAL_BROWSER_OPEN = 'presto-external-browser-open';

export type ExternalBrowserOpenDetail = {
  /** 目标 URL；loading 时可为空，稍后用同事件更新 */
  url?: string;
  title?: string;
  /** 为 true 时显示加载态（创世记取 session 等） */
  loading?: boolean;
};

export function openExternalBrowser(detail: ExternalBrowserOpenDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(EXTERNAL_BROWSER_OPEN, {
      detail: {
        url: (detail.url || '').trim(),
        title: (detail.title || '').trim() || undefined,
        loading: Boolean(detail.loading),
      } satisfies ExternalBrowserOpenDetail,
    }),
  );
}

export function openInSystemBrowser(url: string): void {
  const raw = (url || '').trim();
  if (!raw || typeof window === 'undefined') return;
  window.open(raw, '_blank', 'noopener,noreferrer');
}
