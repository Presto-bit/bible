'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { isStandalonePwa } from '@/lib/platform';
import { keepAliveTabId, type KeepAliveTabId } from '@/lib/tab_keep_alive';
import { getPwaTabPathname, subscribePwaTabNav } from '@/lib/pwa_tab_nav';
import { TabKeepAliveProvider } from './TabKeepAliveContext';

function subscribePwaDisplayMode(onChange: () => void) {
  const mq = window.matchMedia('(display-mode: standalone)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getPwaSnapshot() {
  return isStandalonePwa();
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

const TAB_COMPONENTS: Record<KeepAliveTabId, React.ComponentType> = {
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
  const enabled = useSyncExternalStore(subscribePwaDisplayMode, getPwaSnapshot, () => false);
  const pwaPathname = useSyncExternalStore(subscribePwaTabNav, getPwaTabPathname, () => '/');
  const pathname = enabled ? pwaPathname : routerPathname;
  const activeTab = keepAliveTabId(pathname);
  const [mounted, setMounted] = useState<Record<KeepAliveTabId, boolean>>(emptyMounted);

  const suppressRoute = enabled && activeTab !== null;

  useEffect(() => {
    if (!enabled) return;
    setMounted({
      home: true,
      reader: true,
      assistant: true,
      discover: true,
      profile: true,
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !activeTab) return;
    setMounted((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [enabled, activeTab]);

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
            {tab === 'reader' ? <ReaderTab paneActive={active} /> : <Pane />}
          </div>
        );
      })}
    </TabKeepAliveProvider>
  );
}
