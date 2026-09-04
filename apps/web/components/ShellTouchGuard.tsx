'use client';

import { useEffect } from 'react';
import { initPcWheelPassthrough } from '@/lib/pc_wheel_passthrough';
import { purgeShellTouchBlockers, softRecoverShellTouch } from '@/lib/sheet_overlay';

export default function ShellTouchGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    return initPcWheelPassthrough();
  }, []);

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
