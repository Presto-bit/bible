/** PWA 主 Tab 客户端导航：离线时不触发 Next RSC 请求。 */

import { normalizeAppPath } from './tab_keep_alive';
import { withBasePath } from './basePath';

export const PWA_MAIN_TAB_HREFS = ['/', '/reader', '/assistant', '/discover', '/profile'] as const;

export type PwaMainTabHref = (typeof PWA_MAIN_TAB_HREFS)[number];

export function isPwaMainTabHref(href: string): href is PwaMainTabHref {
  return (PWA_MAIN_TAB_HREFS as readonly string[]).includes(href);
}

export function navigatePwaTab(href: PwaMainTabHref): void {
  const fullHref = withBasePath(href);
  const target = normalizeAppPath(fullHref);
  const current = normalizeAppPath(window.location.pathname);
  if (current === target) return;
  window.history.pushState({ pwaTab: true }, '', fullHref);
  window.dispatchEvent(new Event('presto-tab-nav'));
}

export function subscribePwaTabNav(onStoreChange: () => void): () => void {
  const notify = () => onStoreChange();
  window.addEventListener('presto-tab-nav', notify);
  window.addEventListener('popstate', notify);
  return () => {
    window.removeEventListener('presto-tab-nav', notify);
    window.removeEventListener('popstate', notify);
  };
}

export function getPwaTabPathname(): string {
  return window.location.pathname;
}
