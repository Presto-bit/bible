// 全站应用主题：典雅白 / 晨曦 / 护眼黄 / 深色

import { getReaderTheme, setReaderTheme, type ReaderTheme } from './reader_settings';

export type AppThemeId = 'classic' | 'dawn' | 'sepia' | 'dark';

const APP_THEME_KEY = 'app_theme';
const READER_FOLLOW_KEY = 'reader_follow_app';
const MIGRATION_KEY = 'app_theme_migrated_classic_v1';
const LEGACY_SCOPE_KEY = 'app_theme_scope';

export const APP_THEMES: {
  id: AppThemeId;
  label: string;
  desc: string;
  preview: string;
}[] = [
  { id: 'classic', label: '典雅白', desc: '清爽白底 · 微信读书风', preview: '#ffffff' },
  { id: 'dawn', label: '晨曦', desc: '暖白晨光 · 橄榄辅色', preview: '#fff8f3' },
  { id: 'sepia', label: '护眼黄', desc: '柔和纸黄 · 长时间阅读', preview: '#f5f0e1' },
  { id: 'dark', label: '深色', desc: '夜间全站深色', preview: '#12181c' },
];

const META_COLORS: Record<AppThemeId, string> = {
  classic: '#ffffff',
  dawn: '#fff8f3',
  sepia: '#f5f0e1',
  dark: '#12181c',
};

function normalizeAppTheme(raw: string | null): AppThemeId {
  if (raw === 'dawn' || raw === 'sepia' || raw === 'dark') return raw;
  return 'classic';
}

/** 上线一次性：老用户默认切到典雅白 */
export function migrateAppThemeIfNeeded() {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATION_KEY)) return;
  localStorage.setItem(APP_THEME_KEY, 'classic');
  localStorage.setItem(READER_FOLLOW_KEY, '0');
  localStorage.removeItem(LEGACY_SCOPE_KEY);
  localStorage.setItem(MIGRATION_KEY, '1');
}

export function getAppTheme(): AppThemeId {
  if (typeof window === 'undefined') return 'classic';
  migrateAppThemeIfNeeded();
  return normalizeAppTheme(localStorage.getItem(APP_THEME_KEY));
}

export function setAppTheme(id: AppThemeId) {
  localStorage.setItem(APP_THEME_KEY, id);
  applyAppTheme();
}

export function getReaderFollowApp(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(READER_FOLLOW_KEY) === '1';
}

export function setReaderFollowApp(on: boolean) {
  localStorage.setItem(READER_FOLLOW_KEY, on ? '1' : '0');
  if (on) setReaderTheme(appThemeToReaderTheme(getAppTheme()));
  window.dispatchEvent(new Event('app-theme-change'));
}

export function appThemeToReaderTheme(app: AppThemeId): ReaderTheme {
  if (app === 'dark') return 'night';
  if (app === 'sepia') return 'sepia';
  return 'morning';
}

export function getEffectiveReaderTheme(): ReaderTheme {
  if (getReaderFollowApp()) return appThemeToReaderTheme(getAppTheme());
  return getReaderTheme();
}

/** 应用主题到 document；仅 app_theme=dark 时全站深色 */
export function applyAppTheme() {
  if (typeof window === 'undefined') return;
  migrateAppThemeIfNeeded();
  const theme = getAppTheme();
  const el = document.documentElement;
  el.dataset.appTheme = theme;
  const isDark = theme === 'dark';
  el.classList.toggle('app-theme-dark', isDark);
  el.classList.toggle('group-reader-night', isDark);
  el.classList.toggle('app-reader-night', isDark);
  if (getReaderFollowApp()) {
    setReaderTheme(appThemeToReaderTheme(theme));
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', META_COLORS[theme]);
  window.dispatchEvent(new Event('app-theme-change'));
}

export function appThemeMetaColor(id: AppThemeId): string {
  return META_COLORS[id];
}
