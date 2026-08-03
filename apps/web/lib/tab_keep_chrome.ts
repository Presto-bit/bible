/** Tab 保活：滚动位置、焦点方框、body 壳 class，减少安卓 WebView 串页与焦点框 */

import { applyAppTheme } from '@/lib/app_theme';
import { clearReaderChrome } from '@/lib/reader_chrome';
import type { KeepAliveTabId } from '@/lib/tab_keep_alive';

const scrollByTab: Partial<Record<KeepAliveTabId, number>> = {};

export function readDocumentScrollTop(): number {
  if (typeof window === 'undefined') return 0;
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
 * 关掉挂到 document.body 的半屏/操作条。
 * Tab 保活只 hidden 原 pane，portal 仍留在 body 上，会「串」到小爱/发现等 Tab。
 */
export function dismissPortaledOverlays(): void {
  if (typeof document === 'undefined') return;
  const selectors = [
    '.sheet-backdrop',
    '.reader-sheet-backdrop',
    '.im-msg-popover-backdrop',
    '[data-dismiss-on-tab-nav]',
  ];
  try {
    document.querySelectorAll(selectors.join(',')).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      try {
        node.click();
      } catch {
        /* ignore */
      }
    });
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
    document.body.classList.remove('assistant-keyboard', 'assistant-keyboard-vv', 'assistant-active');
    document.documentElement.style.removeProperty('--assistant-vv-h');
    document.documentElement.style.removeProperty('--assistant-kb-inset');
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
    // 先关 portal overlay，再清 chrome，避免残影
    dismissPortaledOverlays();
  }
  cleanupTabBodyChrome(prev, next);
  clearInteractiveFocusArtifacts();
  if (next) restoreTabScroll(next);
}
