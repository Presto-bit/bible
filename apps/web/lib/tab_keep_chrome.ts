/** Tab 保活：滚动位置、焦点方框、body 壳 class，减少安卓 WebView 串页与焦点框 */

import { applyAppTheme } from '@/lib/app_theme';
import { clearReaderChrome } from '@/lib/reader_chrome';
import { setShelfReaderChrome } from '@/lib/shelf_host';
import {
  clearAssistantTouchLocks,
  dismissOrphanBodySheetBackdrops,
  dismissPortaledOverlays,
  purgeShellTouchBlockers,
} from '@/lib/sheet_overlay';
import type { KeepAliveTabId } from '@/lib/tab_keep_alive';

export { dismissPortaledOverlays, purgeShellTouchBlockers };

const scrollByTab: Partial<Record<KeepAliveTabId, number>> = {};

function appBodyEl(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const app = document.querySelector('.app-body');
  return app instanceof HTMLElement ? app : null;
}

/** PC 浏览器：主滚动在 .app-body；移动端/PWA 仍在 document */
function usesAppBodyScroll(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
  const app = appBodyEl();
  if (!app) return false;
  const oy = getComputedStyle(app).overflowY;
  return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
}

export function readDocumentScrollTop(): number {
  if (typeof window === 'undefined') return 0;
  if (usesAppBodyScroll()) {
    return Math.max(0, appBodyEl()?.scrollTop ?? 0);
  }
  const se = document.scrollingElement;
  const seTop = se instanceof HTMLElement ? se.scrollTop : 0;
  return Math.max(
    window.scrollY || 0,
    window.pageYOffset || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0,
    seTop,
  );
}

export function writeDocumentScrollTop(y: number): void {
  if (typeof window === 'undefined') return;
  const next = Math.max(0, Math.floor(y));
  if (usesAppBodyScroll()) {
    const app = appBodyEl();
    if (app) {
      app.scrollTop = next;
      return;
    }
  }
  window.scrollTo(0, next);
  document.documentElement.scrollTop = next;
  document.body.scrollTop = next;
  const se = document.scrollingElement;
  if (se instanceof HTMLElement) se.scrollTop = next;
}

export function saveTabScroll(tab: KeepAliveTabId): void {
  scrollByTab[tab] = readDocumentScrollTop();
}

export function restoreTabScroll(tab: KeepAliveTabId): void {
  const y = scrollByTab[tab] ?? 0;
  // 双 rAF：等 hidden/display 切换落定再滚，避免读到错页高度
  requestAnimationFrame(() => {
    requestAnimationFrame(() => writeDocumentScrollTop(y));
  });
}

/** 清除系统焦点方框与文本选区（WebView 点完按钮常留方框） */
export function clearInteractiveFocusArtifacts(): void {
  if (typeof document === 'undefined') return;
  try {
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) sel.removeAllRanges();
  } catch {
    /* ignore */
  }
  try {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el !== document.body && el !== document.documentElement) {
      // 保留输入框聚焦
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return;
      el.blur();
    }
  } catch {
    /* ignore */
  }
}

/**
 * 离开某 Tab 时清掉全局 body class，避免圣经/小爱的壳层样式串到其它 Tab。
 */
export function cleanupTabBodyChrome(leaving: KeepAliveTabId | null, entering: KeepAliveTabId | null): void {
  if (typeof document === 'undefined') return;
  if (leaving === 'reader' && entering !== 'reader') {
    clearReaderChrome();
    applyAppTheme();
  }
  if (leaving === 'assistant' && entering !== 'assistant') {
    clearAssistantTouchLocks();
  }
  // 进入首页 / 我的：卸书架全屏壳 + 清小爱锁 + 僵尸遮罩（双保险，主清理在 purge）
  if (entering === 'profile' || entering === 'home') {
    setShelfReaderChrome(false);
    clearAssistantTouchLocks();
    dismissOrphanBodySheetBackdrops();
  }
  if (leaving && leaving !== entering) {
    document.body.classList.remove('im-keyboard', 'im-keyboard-overlay', 'im-plus-sheet', 'im-mention-sheet');
  }
}

export function onKeepAliveTabChange(
  prev: KeepAliveTabId | null,
  next: KeepAliveTabId | null,
): void {
  if (prev) saveTabScroll(prev);
  if (prev && prev !== next) {
    // 先关 portal / 透明吞点击层 / body 锁，再清 chrome
    purgeShellTouchBlockers();
    try {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('height');
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('height');
    } catch {
      /* ignore */
    }
  }
  cleanupTabBodyChrome(prev, next);
  clearInteractiveFocusArtifacts();
  if (next) restoreTabScroll(next);
}
