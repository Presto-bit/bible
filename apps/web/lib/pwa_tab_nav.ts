/** 主 Tab 客户端导航：保活模式下离线切换不触发 Next RSC 请求。 */

import { isTabKeepAliveEnabled } from './platform';
import { markReaderTabEntry } from './reading';
import { beginSoftNavProgress } from './soft_nav_progress';
import {
  isSecondaryAppPath,
  keepAliveTabHref,
  keepAliveTabId,
  normalizeAppPath,
  type KeepAliveTabId,
} from './tab_keep_alive';
import { clientWithBasePath, withBasePath } from './basePath';

type NavSource = 'tab' | 'route';

let lastNavSource: NavSource = 'route';
let lastMainTabHref: PwaMainTabHref = '/';
/** router.push 二级页尚未到达目标前，记录来源主 Tab 与目标路径 */
let pendingSecondaryTarget: string | null = null;
let pendingSecondaryFrom: PwaMainTabHref = '/';

function atSecondaryTarget(current: string, target: string): boolean {
  return current === target || current.startsWith(`${target}/`);
}

function beginPendingSecondaryNav(targetPath: string) {
  pendingSecondaryTarget = normalizeAppPath(targetPath.split('?')[0] ?? targetPath);
  pendingSecondaryFrom = lastMainTabHref;
}

function clearPendingSecondaryNav() {
  pendingSecondaryTarget = null;
}

/** TabKeepAlive 壳层与 navigateAppHref 对齐：当前可见主 Tab 即 lastMainTabHref 来源 */
export function syncKeepAliveMainTab(tab: KeepAliveTabId | null) {
  if (tab === null) return;
  lastMainTabHref = keepAliveTabHref(tab) as PwaMainTabHref;
}

/** Next router 尚未到达二级页目标时为 true（不依赖 pushState 抢先改 URL） */
export function isSecondaryNavPending(routerPathname: string): boolean {
  if (!pendingSecondaryTarget) return false;
  const r = normalizeAppPath(routerPathname);
  return !atSecondaryTarget(r, pendingSecondaryTarget);
}

export function getPwaMainTabFallback(): PwaMainTabHref {
  return lastMainTabHref;
}

/**
 * 壳层 pathname（底栏高亮 / Tab LRU）：二级页导航过渡期跟来源主 Tab，
 * 避免 router 仍在 / 时误判为「无 Tab + 藏底栏 + 露出首页路由」。
 */
export function resolvePwaShellPathname(routerPathname: string, pwaPathname: string): string {
  const r = normalizeAppPath(routerPathname);
  if (pendingSecondaryTarget && atSecondaryTarget(r, pendingSecondaryTarget)) {
    clearPendingSecondaryNav();
  }
  if (pendingSecondaryTarget) {
    return pendingSecondaryFrom;
  }
  return resolvePwaPathname(routerPathname, pwaPathname);
}

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
  clearPendingSecondaryNav();
  const fullHref = withBasePath(href);
  const target = normalizeAppPath(fullHref);
  lastMainTabHref = target as PwaMainTabHref;
  const current = normalizeAppPath(window.location.pathname);
  lastNavSource = 'tab';
  if (current !== target) {
    window.history.pushState({ pwaTab: true }, '', fullHref);
  }
  window.dispatchEvent(new Event('presto-tab-nav'));
}

/** 统一应用内跳转：主 Tab（含 query）、读经页、二级页。 */
export function navigateAppHref(
  href: string,
  router: { push: (url: string, options?: { scroll?: boolean }) => void },
): void {
  if (typeof window === 'undefined') return;
  const normalized = href.startsWith('/') ? href : `/${href}`;
  if (normalized.startsWith('/reader')) {
    navigateToReaderHref(normalized, router);
    return;
  }
  const pathOnly = normalizeAppPath(normalized.split('?')[0] ?? normalized);
  if (isTabKeepAliveEnabled() && isPwaMainTabHref(pathOnly)) {
    clearPendingSecondaryNav();
    const fullHref = clientWithBasePath(normalized);
    const currentPath = normalizeAppPath(window.location.pathname);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    lastNavSource = 'tab';
    lastMainTabHref = pathOnly as PwaMainTabHref;
    if (currentPath !== pathOnly || currentUrl !== fullHref) {
      window.history.pushState({ pwaTab: true }, '', fullHref);
    }
    window.dispatchEvent(new Event('presto-tab-nav'));
    return;
  }
  if (isTabKeepAliveEnabled() && isSecondaryAppPath(pathOnly)) {
    beginPendingSecondaryNav(pathOnly);
    markRouteNavigation();
    beginSoftNavProgress(normalized);
    router.push(normalized);
    window.dispatchEvent(new Event('presto-tab-nav'));
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('presto-tab-nav'));
    });
    return;
  }
  markRouteNavigation();
  if (isSecondaryAppPath(pathOnly) || keepAliveTabId(pathOnly) === null) {
    beginSoftNavProgress(normalized);
  }
  router.push(normalized);
  if (typeof window !== 'undefined' && isTabKeepAliveEnabled()) {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('presto-tab-nav'));
    });
  }
}

/**
 * PWA 下合并 Next router 与 pushState Tab 路径。
 * 二级页走 router；底栏 Tab 走 pwaPath，避免 /admin 被旧 Tab 路径盖住。
 */
export function resolvePwaPathname(routerPathname: string, pwaPathname: string): string {
  const r = normalizeAppPath(routerPathname);
  const p = normalizeAppPath(pwaPathname);
  if (r === p) return r;

  if (isSecondaryAppPath(r)) return r;

  const routerTab = keepAliveTabId(r);
  const pwaTab = keepAliveTabId(p);

  if (routerTab === null) {
    if (lastNavSource === 'tab' && pwaTab !== null) return p;
    return r;
  }

  if (lastNavSource === 'tab' && pwaTab !== null) return p;
  if (lastNavSource === 'route') return r;
  if (pwaTab !== null) return p;
  return r;
}

/** 从任意 Tab 打开读经页（含 ref 查询参数），兼容 Tab 保活。 */
export function navigateToReaderHref(
  href: string,
  router: { push: (url: string, options?: { scroll?: boolean }) => void },
): void {
  if (typeof window === 'undefined') return;
  clearPendingSecondaryNav();
  markRouteNavigation();
  markReaderTabEntry();
  router.push(href, { scroll: false });
  if (!isTabKeepAliveEnabled()) return;
  const fullHref = clientWithBasePath(href.startsWith('/') ? href : `/${href}`);
  window.history.replaceState({ pwaTab: true }, '', fullHref);
  window.dispatchEvent(new Event('presto-tab-nav'));
}

export function subscribePwaTabNav(onStoreChange: () => void): () => void {
  const notify = () => onStoreChange();
  const onPop = () => {
    clearPendingSecondaryNav();
    notify();
  };
  window.addEventListener('presto-tab-nav', notify);
  window.addEventListener('popstate', onPop);
  return () => {
    window.removeEventListener('presto-tab-nav', notify);
    window.removeEventListener('popstate', onPop);
  };
}

export function getPwaTabPathname(): string {
  return window.location.pathname;
}
