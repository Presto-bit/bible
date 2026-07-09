/** 主 Tab 客户端导航：保活模式下离线切换不触发 Next RSC 请求。 */

import { keepAliveTabId, normalizeAppPath } from './tab_keep_alive';
import { withBasePath } from './basePath';

type NavSource = 'tab' | 'route';

let lastNavSource: NavSource = 'route';

/** Next Link / router 进入二级页（如 /admin）时标记，供 pathname 解析。 */
export function markRouteNavigation(): void {
  lastNavSource = 'route';
}

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
  lastNavSource = 'tab';
  window.history.pushState({ pwaTab: true }, '', fullHref);
  window.dispatchEvent(new Event('presto-tab-nav'));
}

/**
 * PWA 下合并 Next router 与 pushState Tab 路径。
 * 二级页走 router；底栏 Tab 走 pwaPath，避免 /admin 被旧 Tab 路径盖住。
 */
export function resolvePwaPathname(routerPathname: string, pwaPathname: string): string {
  const r = normalizeAppPath(routerPathname);
  const p = normalizeAppPath(pwaPathname);
  if (r === p) return r;

  const routerTab = keepAliveTabId(r);
  const pwaTab = keepAliveTabId(p);

  if (lastNavSource === 'tab' && pwaTab !== null) return p;
  if (lastNavSource === 'route' && routerTab === null) return r;
  if (routerTab === null && pwaTab !== null) return r;
  if (pwaTab !== null) return p;
  return r;
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
