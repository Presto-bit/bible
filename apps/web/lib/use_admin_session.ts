'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminCheck } from './admin_rag';

/** 已登录且 token 有效的管理后台会话 */
export function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(() => {
    void adminCheck().then((ok) => {
      setIsAdmin(ok);
      setChecking(false);
    });
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  return { isAdmin, checking, refresh };
}
