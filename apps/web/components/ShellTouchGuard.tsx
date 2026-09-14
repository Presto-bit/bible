'use client';

import { useEffect } from 'react';
import { initPcUiClass } from '@/lib/pc_ui';
import { initPcWheelPassthrough } from '@/lib/pc_wheel_passthrough';
import { onShellOrFlutterResume } from '@/lib/shell_resume';
import { purgeShellTouchBlockers, softRecoverShellTouch } from '@/lib/sheet_overlay';

export default function ShellTouchGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    return initPcUiClass();
  }, []);

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

    const offShellResume = onShellOrFlutterResume(hardRecover);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      offShellResume();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return null;
}
