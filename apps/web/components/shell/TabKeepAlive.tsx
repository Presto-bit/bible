'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isTabKeepAliveEnabled, isStandalonePwa } from '@/lib/platform';
import {
  APP_SECONDARY_PREFIXES,
  DISCOVER_SECONDARY_PREFIXES,
  isSecondaryAppPath,
  PROFILE_SECONDARY_PATHS,
  keepAliveTabId,
  normalizeAppPath,
  type KeepAliveTabId,
} from '@/lib/tab_keep_alive';
import { isPeiaiAndroidShell } from '@/lib/pwa_platform';
import {
  getPwaTabPathname,
  markRouteNavigation,
  resolvePwaPathname,
  subscribePwaTabNav,
} from '@/lib/pwa_tab_nav';
import { isAssistantStreamBusy } from '@/lib/assistant_stream_busy';
import { onKeepAliveTabChange, clearInteractiveFocusArtifacts } from '@/lib/tab_keep_chrome';
import { TabKeepAliveProvider } from './TabKeepAliveContext';

function subscribeKeepAlive(onChange: () => void) {
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getKeepAliveSnapshot() {
  return isTabKeepAliveEnabled();
}

const paneLoading = (
  <main className="container tab-pane-skeleton" aria-busy="true" aria-label="加载中">
    <div className="tab-skel-block tab-skel-hero" />
    <div className="tab-skel-block" />
    <div className="tab-skel-block tab-skel-short" />
  </main>
);

function TabLoadError() {
  return (
    <main className="container" style={{ paddingTop: 48, textAlign: 'center' }}>
      <p className="muted">页面加载失败，请重试</p>
      <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
        重新加载
      </button>
    </main>
  );
}

function loadTab<T>(loader: () => Promise<{ default: T }>) {
  return loader().catch(() => ({ default: TabLoadError as unknown as T }));
}

const HomeTab = dynamic(() => loadTab(() => import('@/components/HomePage')), {
  ssr: false,
  loading: () => paneLoading,
});

const ReaderTab = dynamic(() => loadTab(() => import('@/components/tabs/ReaderTab')), {
  ssr: false,
  loading: () => paneLoading,
});

const AssistantTab = dynamic(() => loadTab(() => import('@/components/tabs/AssistantTab')), {
  ssr: false,
  loading: () => paneLoading,
});

const DiscoverTab = dynamic(() => loadTab(() => import('@/components/tabs/DiscoverTab')), {
  ssr: false,
  loading: () => paneLoading,
});

const ProfileTab = dynamic(() => loadTab(() => import('@/components/tabs/ProfileTab')), {
  ssr: false,
  loading: () => paneLoading,
});

const TAB_COMPONENTS: Record<KeepAliveTabId, React.ComponentType<{ paneActive?: boolean }>> = {
  home: HomeTab,
  reader: ReaderTab,
  assistant: AssistantTab,
  discover: DiscoverTab,
  profile: ProfileTab,
};

const ALL_TABS: KeepAliveTabId[] = ['home', 'reader', 'assistant', 'discover', 'profile'];
/** 同时保活上限：home + reader + 当前（或再加 1 个最近）；安卓壳五 Tab 全保，避免发现被踢 */
const MAX_MOUNTED_TABS = 4;
const MAX_MOUNTED_TABS_SHELL = 5;

function emptyMounted(): Record<KeepAliveTabId, boolean> {
  return {
    home: false,
    reader: false,
    assistant: false,
    discover: false,
    profile: false,
  };
}

export default function TabKeepAlive({ children }: { children: React.ReactNode }) {
  const routerPathname = usePathname();
  const enabled = useSyncExternalStore(subscribeKeepAlive, getKeepAliveSnapshot, () => false);
  const pwaPathname = useSyncExternalStore(subscribePwaTabNav, getPwaTabPathname, () => '/');
  const prevRouterRef = useRef(routerPathname);
  const lastActiveAtRef = useRef<Partial<Record<KeepAliveTabId, number>>>({});
  if (enabled && prevRouterRef.current !== routerPathname) {
    const r = normalizeAppPath(routerPathname);
    if (keepAliveTabId(r) === null) {
      markRouteNavigation();
    }
    prevRouterRef.current = routerPathname;
  }
  const pathname = enabled
    ? resolvePwaPathname(routerPathname, pwaPathname)
    : normalizeAppPath(routerPathname);
  const activeTab = keepAliveTabId(pathname);
  const [mounted, setMounted] = useState<Record<KeepAliveTabId, boolean>>(emptyMounted);
  const prevActiveTabRef = useRef<KeepAliveTabId | null>(null);

  // 当前 Tab 首帧就要挂载：不可等 useEffect，否则 suppress 后无 pane → 白屏
  const paneVisible = (tab: KeepAliveTabId) =>
    Boolean(mounted[tab] || (enabled && activeTab === tab));

  const routerPath = normalizeAppPath(routerPathname);
  const pwaPath = normalizeAppPath(pwaPathname);
  // pushState 已指向二级页时，即便 Next router 仍在旧 Tab，也不 suppress 路由层
  const routeOverlayPath = isSecondaryAppPath(routerPath)
    ? routerPath
    : isSecondaryAppPath(pwaPath)
      ? pwaPath
      : routerPath;
  // 仅在 KeepAlive pane 已可见时隐藏路由 children，避免空窗期；二级页（设置等）永不 suppress
  const suppressRoute =
    enabled
    && activeTab !== null
    && paneVisible(activeTab)
    && !isSecondaryAppPath(routeOverlayPath);

  // 切 Tab：滚轮隔离 + 清 body 壳 class + 去焦点方框，避免「页面串行」
  useEffect(() => {
    if (!enabled) {
      prevActiveTabRef.current = null;
      return;
    }
    const prev = prevActiveTabRef.current;
    if (prev !== activeTab) {
      onKeepAliveTabChange(prev, activeTab);
      prevActiveTabRef.current = activeTab;
    }
  }, [enabled, activeTab]);

  // 按需挂载 + LRU 驱逐：访问过的 Tab 保持实例，超出上限卸掉最久未用（保护 home/当前）
  useEffect(() => {
    if (!enabled) return;
    const routerPath = normalizeAppPath(routerPathname);
    const onDiscoverSecondary = DISCOVER_SECONDARY_PREFIXES.some(
      (p) => routerPath === p || routerPath.startsWith(p),
    );
    const onProfileSecondary = PROFILE_SECONDARY_PATHS.some(
      (p) => routerPath === p || routerPath.startsWith(`${p}/`),
    );
    // 笔记 / 书架 / 本月已读等：从「我的」进入，返回时保留 profile 保活
    const onAppSecondaryFromProfile = APP_SECONDARY_PREFIXES.some(
      (p) => routerPath === p || routerPath.startsWith(`${p}/`),
    );
    // 二级页（设置 / IM / 笔记书架）时 activeTab 为 null，仍需保护对应主 Tab 列表保活
    if (!activeTab && !onDiscoverSecondary && !onProfileSecondary && !onAppSecondaryFromProfile) {
      return;
    }
    if (activeTab) lastActiveAtRef.current[activeTab] = Date.now();
    if (onDiscoverSecondary) lastActiveAtRef.current.discover = Date.now();
    if (onProfileSecondary || onAppSecondaryFromProfile) {
      lastActiveAtRef.current.profile = Date.now();
    }
    const maxTabs =
      isPeiaiAndroidShell() || isStandalonePwa()
        ? MAX_MOUNTED_TABS_SHELL
        : MAX_MOUNTED_TABS;
    setMounted((prev) => {
      const next: Record<KeepAliveTabId, boolean> = { ...prev };
      if (activeTab) next[activeTab] = true;
      if (onDiscoverSecondary) next.discover = true;
      if (onProfileSecondary || onAppSecondaryFromProfile) next.profile = true;
      let mountedIds = ALL_TABS.filter((t) => next[t]);
      if (mountedIds.length <= maxTabs) return next;

      const protectedTabs = new Set<KeepAliveTabId>(['home', 'reader']);
      if (activeTab) protectedTabs.add(activeTab);
      if (isAssistantStreamBusy()) protectedTabs.add('assistant');
      if (onDiscoverSecondary || activeTab === 'discover') protectedTabs.add('discover');
      if (onProfileSecondary || onAppSecondaryFromProfile || activeTab === 'profile') {
        protectedTabs.add('profile');
      }
      const victims = mountedIds
        .filter((t) => !protectedTabs.has(t))
        .sort(
          (a, b) =>
            (lastActiveAtRef.current[a] || 0) - (lastActiveAtRef.current[b] || 0),
        );
      for (const v of victims) {
        mountedIds = ALL_TABS.filter((t) => next[t]);
        if (mountedIds.length <= maxTabs) break;
        next[v] = false;
      }
      return next;
    });
  }, [enabled, activeTab, routerPathname]);

  useEffect(() => {
    if (enabled) return;
    setMounted(emptyMounted());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    clearInteractiveFocusArtifacts();
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return;
    const pane = el.closest('.tab-keep-pane');
    if (pane?.hasAttribute('hidden')) el.blur();
  }, [activeTab, enabled]);

  const ctx = useMemo(
    () => ({ enabled, activeTab, suppressRoute }),
    [enabled, activeTab, suppressRoute],
  );

  if (!enabled) {
    return <TabKeepAliveProvider value={ctx}>{children}</TabKeepAliveProvider>;
  }

  return (
    <TabKeepAliveProvider value={ctx}>
      <div className={suppressRoute ? 'tab-keep-route-suppressed' : undefined}>
        {children}
      </div>
      {ALL_TABS.map((tab) => {
        if (!paneVisible(tab)) return null;
        const Pane = TAB_COMPONENTS[tab];
        const active = activeTab === tab;
        return (
          <div
            key={tab}
            className={`tab-keep-pane${active ? ' tab-keep-pane-active' : ''}`}
            hidden={!active}
            aria-hidden={!active}
            // inert 禁用失活 Tab 的焦点与点击（减少焦点方框/串击）
            {...(!active ? ({ inert: true } as object) : null)}
          >
            {tab === 'reader' ? <ReaderTab paneActive={active} /> : <Pane paneActive={active} />}
          </div>
        );
      })}
    </TabKeepAliveProvider>
  );
}
