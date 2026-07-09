'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTabKeepAlive } from '@/components/shell/TabKeepAliveContext';
import { adminCheck, ADMIN_SESSION_EVENT } from './admin_rag';

/** 已登录且 token 有效的管理后台会话 */
export function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const { activeTab } = useTabKeepAlive();

  const refresh = useCallback(() => {
    void adminCheck().then((ok) => {
      setIsAdmin(ok);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => refresh();
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onRefresh);
    window.addEventListener(ADMIN_SESSION_EVENT, onRefresh);
    return () => {
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onRefresh);
      window.removeEventListener(ADMIN_SESSION_EVENT, onRefresh);
    };
  }, [refresh]);

  // Tab 保活：首页 pane 不卸载，切回首页时需重新校验管理员会话
  useEffect(() => {
    if (activeTab === 'home') refresh();
  }, [activeTab, refresh]);

  return { isAdmin, checking, refresh };
}
