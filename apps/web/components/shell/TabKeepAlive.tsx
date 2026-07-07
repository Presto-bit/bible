'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { isStandalonePwa } from '@/lib/platform';
import { keepAliveTabId, type KeepAliveTabId } from '@/lib/tab_keep_alive';
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

const DiscoverTab = dynamic(() => import('@/app/discover/page'), {
  ssr: false,
  loading: () => paneLoading,
});

const ProfileTab = dynamic(() => import('@/app/profile/page'), {
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
  const pathname = usePathname();
  const enabled = useSyncExternalStore(subscribePwaDisplayMode, getPwaSnapshot, () => false);
  const activeTab = keepAliveTabId(pathname);
  const [mounted, setMounted] = useState<Record<KeepAliveTabId, boolean>>(emptyMounted);

  const suppressRoute = enabled && activeTab !== null;

  useEffect(() => {
    if (!enabled || !activeTab) return;
    setMounted((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
  }, [enabled, activeTab]);

  // 在线时预热五个主 Tab，离线切换不再依赖 RSC 请求
  useEffect(() => {
    if (!enabled || !navigator.onLine) return;
    const warm = () => {
      setMounted({
        home: true,
        reader: true,
        assistant: true,
        discover: true,
        profile: true,
      });
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(t);
  }, [enabled]);

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
