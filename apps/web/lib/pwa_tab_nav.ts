/** 主 Tab 客户端导航：保活模式下离线切换不触发 Next RSC 请求。 */

import { isTabKeepAliveEnabled } from './platform';
import { markReaderTabEntry } from './reading';
import { beginSoftNavProgress } from './soft_nav_progress';
import { isSecondaryAppPath, keepAliveTabId, normalizeAppPath } from './tab_keep_alive';
import { clientWithBasePath, withBasePath } from './basePath';

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
    const fullHref = clientWithBasePath(normalized);
    const currentPath = normalizeAppPath(window.location.pathname);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    lastNavSource = 'tab';
    if (currentPath !== pathOnly || currentUrl !== fullHref) {
      window.history.pushState({ pwaTab: true }, '', fullHref);
    }
    window.dispatchEvent(new Event('presto-tab-nav'));
    return;
  }
  markRouteNavigation();
  // 弱网下 soft nav 可能卡在拉 chunk：立刻给顶栏进度，避免「点了没反应」
  if (isSecondaryAppPath(pathOnly) || keepAliveTabId(pathOnly) === null) {
    beginSoftNavProgress(normalized);
  }
  router.push(normalized);
  // 保活模式：router 启动后再同步 pushState，避免 pane 先卸光而路由层仍是旧 Tab
  if (isTabKeepAliveEnabled() && isSecondaryAppPath(pathOnly)) {
    const fullHref = clientWithBasePath(normalized);
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== fullHref) {
      window.history.pushState({ pwaSecondary: true }, '', fullHref);
    }
    window.dispatchEvent(new Event('presto-tab-nav'));
  }
  // Next soft nav 不触发 popstate；补一次同步，避免 pwaPath 停在旧 Tab 路径
  if (typeof window !== 'undefined' && isTabKeepAliveEnabled()) {
    window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('presto-tab-nav'));
    });
  }
}

/**
 * PWA 下合并 Next router 与 pushState Tab 路径。
 * 二级页走 router；底栏 Tab 走 pwaPath，避免 /admin 被旧 Tab 路径盖住。
 *
 * 设置 / IM 等二级页 keepAliveTabId 为 null。若在 route 模式下仍优先
 * lastNavSource=tab 的旧路径（如 /discover），TabKeepAlive 会 suppress 设置页
 * 并亮发现 pane，确认框就会叠在「发现」上。
 */
export function resolvePwaPathname(routerPathname: string, pwaPathname: string): string {
  const r = normalizeAppPath(routerPathname);
  const p = normalizeAppPath(pwaPathname);
  if (r === p) return r;

  // 设置 / IM 等二级页：始终跟 Next router，避免仍亮「我的/发现」保活层导致设置页被 suppress、点击无响应
  if (isSecondaryAppPath(r)) return r;

  // pushState 已指向二级页但 Next router 尚未切过去：仍跟 router，避免主 Tab pane 全隐藏而路由层还是首页 → 灰屏/点击无反应
  if (isSecondaryAppPath(p) && !isSecondaryAppPath(r) && lastNavSource === 'route') {
    return r;
  }

  // pushState 已切到二级页、Next router 尚在旧 Tab：跟 pwa，卸掉首页保活层
  if (isSecondaryAppPath(p) && lastNavSource === 'route') return p;

  const routerTab = keepAliveTabId(r);
  const pwaTab = keepAliveTabId(p);

  // 二级页：route 模式跟 router；若已 pushState 回主 Tab 则跟 pwa
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
