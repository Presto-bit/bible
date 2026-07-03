'use client';

import { useEffect } from 'react';
import { getReaderTheme } from '@/lib/reader_settings';

const SCOPE_KEY = 'app_theme_scope';

export type AppThemeScope = 'reader' | 'global';

export function getAppThemeScope(): AppThemeScope {
  if (typeof window === 'undefined') return 'reader';
  return localStorage.getItem(SCOPE_KEY) === 'global' ? 'global' : 'reader';
}

export function setAppThemeScope(scope: AppThemeScope) {
  localStorage.setItem(SCOPE_KEY, scope);
  document.documentElement.classList.toggle(
    'app-reader-night',
    scope === 'global' && getReaderTheme() === 'night',
  );
  document.documentElement.classList.toggle(
    'group-reader-night',
    getReaderTheme() === 'night',
  );
}

/** 全站/群页与阅读器「夜深」主题联动 */
export function AppThemeShell() {
  useEffect(() => {
    const apply = () => {
      const night = getReaderTheme() === 'night';
      const global = getAppThemeScope() === 'global';
      document.documentElement.classList.toggle('group-reader-night', night);
      document.documentElement.classList.toggle('app-reader-night', night && global);
    };
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'reader_theme' || e.key === SCOPE_KEY || e.key === null) apply();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') apply();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.documentElement.classList.remove('group-reader-night', 'app-reader-night');
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return null;
}
