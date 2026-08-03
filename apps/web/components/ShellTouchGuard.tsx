'use client';

/**
 * 安卓壳回前台时卸除吞点击遮罩与 body 锁。
 * WebView 跨 pause 后 KeepAlive 状态里未关的全屏层极易导致「处处点不动」。
 */

import { useEffect } from 'react';
import { purgeShellTouchBlockers, softRecoverShellTouch } from '@/lib/sheet_overlay';

export default function ShellTouchGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hardRecover = () => {
      try {
        purgeShellTouchBlockers();
      } catch {
        /* ignore */
      }
    };

    const softRecover = () => {
      try {
        softRecoverShellTouch();
      } catch {
        /* ignore */
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') softRecover();
    };

    window.addEventListener('peiai-shell-resume', hardRecover);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('peiai-shell-resume', hardRecover);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return null;
}
