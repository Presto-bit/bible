/** 离开经文阅读页时恢复全局壳层（目录、选章等）。 */

import { appThemeMetaColor, getAppTheme } from './app_theme';
import { hardRemoveBlockingOverlays } from './sheet_overlay';

export function clearReaderChrome() {
  document.body.classList.remove(
    'reader-active',
    'reader-immersive',
    'reader-overlay-open',
  );
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('--reader-surface-bg');
  document.body.style.background = '';
  document.documentElement.style.background = '';
  const meta = document.querySelector('meta[name="theme-color"]');
  // 与当前应用主题 / iOS PWA meta 一致，勿写死纸色导致状态栏与全站主题脱节
  meta?.setAttribute('content', appThemeMetaColor(getAppTheme()));
  window.dispatchEvent(new Event('app-theme-change'));
}

/**
 * 关词典/半屏后恢复横滑与顶栏点击：
 * - 剥 is-turning（touch-action:none 时壳上常只剩竖滚）
 * - 清 reader-overlay-open / body overflow 残留
 * - 卸空 portal 层；通知翻页 hook cancelDrag
 * 性能：O(DOM 小选择器)，仅在关层路径调用。
 */
export function unlockReaderSurface() {
  if (typeof document === 'undefined') return;
  try {
    document.body.classList.remove('reader-overlay-open');
    document.body.style.removeProperty('overflow');
  } catch {
    /* ignore */
  }
  try {
    document
      .querySelectorAll('.reader-turn-viewport.is-turning')
      .forEach((el) => el.classList.remove('is-turning'));
  } catch {
    /* ignore */
  }
  try {
    hardRemoveBlockingOverlays();
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event('peiai-reader-unlock'));
  } catch {
    /* ignore */
  }
}
