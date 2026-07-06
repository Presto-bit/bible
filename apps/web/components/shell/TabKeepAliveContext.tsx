'use client';

import { createContext, useContext } from 'react';
import type { KeepAliveTabId } from '@/lib/tab_keep_alive';

export type TabKeepAliveContextValue = {
  enabled: boolean;
  activeTab: KeepAliveTabId | null;
  suppressRoute: boolean;
};

const TabKeepAliveContext = createContext<TabKeepAliveContextValue>({
  enabled: false,
  activeTab: null,
  suppressRoute: false,
});

export function TabKeepAliveProvider({
  value,
  children,
}: {
  value: TabKeepAliveContextValue;
  children: React.ReactNode;
}) {
  return (
    <TabKeepAliveContext.Provider value={value}>
      {children}
    </TabKeepAliveContext.Provider>
  );
}

export function useTabKeepAlive() {
  return useContext(TabKeepAliveContext);
}

/** 保活路由下由壳层渲染 Tab，page.tsx 应返回 null 避免双挂载。 */
export function useSuppressKeepAliveRoute() {
  return useContext(TabKeepAliveContext).suppressRoute;
}
