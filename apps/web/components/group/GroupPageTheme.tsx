'use client';

import { useEffect } from 'react';
import { getReaderTheme } from '@/lib/reader_settings';

/** 群页背景与阅读器「夜深」主题联动 */
export function GroupPageTheme() {
  useEffect(() => {
    const apply = () => {
      const night = getReaderTheme() === 'night';
      document.documentElement.classList.toggle('group-reader-night', night);
    };
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'reader_theme' || e.key === null) apply();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') apply();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.documentElement.classList.remove('group-reader-night');
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return null;
}
