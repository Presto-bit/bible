'use client';

import { useEffect } from 'react';
import { applyAppTheme } from '@/lib/app_theme';

/** 全站应用主题（典雅白 / 晨曦 / 护眼黄 / 深色） */
export function AppThemeShell() {
  useEffect(() => {
    applyAppTheme();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === 'app_theme'
        || e.key === 'reader_follow_app'
        || e.key === 'reader_theme'
        || e.key === null
      ) {
        applyAppTheme();
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') applyAppTheme();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return null;
}
