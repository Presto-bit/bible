/** 离开经文阅读页时恢复全局壳层（目录、选章等）。 */

import { appThemeMetaColor, getAppTheme } from './app_theme';

export function clearReaderChrome() {
  document.body.classList.remove('reader-active', 'reader-immersive');
  document.body.style.removeProperty('--reader-surface-bg');
  document.body.style.background = '';
  document.documentElement.style.background = '';
  const meta = document.querySelector('meta[name="theme-color"]');
  // 与当前应用主题 / iOS PWA meta 一致，勿写死纸色导致状态栏与全站主题脱节
  meta?.setAttribute('content', appThemeMetaColor(getAppTheme()));
  window.dispatchEvent(new Event('app-theme-change'));
}
