'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isTabKeepAliveEnabled } from '@/lib/platform';
import { keepAliveTabId, normalizeAppPath, type KeepAliveTabId } from '@/lib/tab_keep_alive';
import {
  getPwaTabPathname,
  markRouteNavigation,
  resolvePwaPathname,
  subscribePwaTabNav,
} from '@/lib/pwa_tab_nav';
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
  <main className="container">
    <p className="muted">加载中…</p>
  </main>
);

const HomeTab = dynamic(() => import('@/components/HomePage'), {
  ssr: false,
  loading: () => paneLoading,
});

const ReaderTab = dynamic(() => import('@/components/tabs/ReaderTab'), {
  ssr: false,
  loading: () => paneLoading,
});

const AssistantTab = dynamic(() => import('@/components/tabs/AssistantTab'), {
  ssr: false,
  loading: () => paneLoading,
});

const DiscoverTab = dynamic(() => import('@/components/tabs/DiscoverTab'), {
  ssr: false,
  loading: () => paneLoading,
});

const ProfileTab = dynamic(() => import('@/components/tabs/ProfileTab'), {
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

  const suppressRoute = enabled && activeTab !== null;

  // 按需挂载：仅在访问过的 Tab 上保持实例；不再首屏并行挂满五个。
  useEffect(() => {
    if (!enabled || !activeTab) return;
    setMounted((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [enabled, activeTab]);

  useEffect(() => {
    if (enabled) return;
    setMounted(emptyMounted());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
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
        if (!mounted[tab]) return null;
        const Pane = TAB_COMPONENTS[tab];
        const active = activeTab === tab;
        return (
          <div
            key={tab}
            className={`tab-keep-pane${active ? ' tab-keep-pane-active' : ''}`}
            hidden={!active}
            aria-hidden={!active}
          >
            {tab === 'reader' ? <ReaderTab paneActive={active} /> : <Pane paneActive={active} />}
          </div>
        );
      })}
    </TabKeepAliveProvider>
  );
}
