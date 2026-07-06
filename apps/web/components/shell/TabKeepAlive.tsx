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

const ReaderTab = dynamic(() => import('@/components/tabs/ReaderTab'), {
  ssr: false,
  loading: () => (
    <main className="container">
      <p className="muted">加载中…</p>
    </main>
  ),
});

const AssistantTab = dynamic(() => import('@/components/tabs/AssistantTab'), {
  ssr: false,
  loading: () => (
    <main className="container">
      <p className="muted">加载中…</p>
    </main>
  ),
});

export default function TabKeepAlive({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = useSyncExternalStore(subscribePwaDisplayMode, getPwaSnapshot, () => false);
  const activeTab = keepAliveTabId(pathname);
  const [mounted, setMounted] = useState<Record<KeepAliveTabId, boolean>>({
    reader: false,
    assistant: false,
  });

  const suppressRoute = enabled && (activeTab === 'reader' || activeTab === 'assistant');

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
      {mounted.reader && (
        <div
          className={`tab-keep-pane${activeTab === 'reader' ? ' tab-keep-pane-active' : ''}`}
          hidden={activeTab !== 'reader'}
          aria-hidden={activeTab !== 'reader'}
        >
          <ReaderTab paneActive={activeTab === 'reader'} />
        </div>
      )}
      {mounted.assistant && (
        <div
          className={`tab-keep-pane${activeTab === 'assistant' ? ' tab-keep-pane-active' : ''}`}
          hidden={activeTab !== 'assistant'}
          aria-hidden={activeTab !== 'assistant'}
        >
          <AssistantTab paneActive={activeTab === 'assistant'} />
        </div>
      )}
    </TabKeepAliveProvider>
  );
}
