/**
 * 全屏半屏遮罩统一策略（TWA / PWA 通用）：
 * 1) 遮罩必须可点关（onClick → onClose）
 * 2) 切主 Tab 可关（data-dismiss-on-tab-nav + presto-tab-nav）
 * 3) 优先挂 AppBodyPortal，避免 KeepAlive 隐页后 fixed 遮罩仍吞点击
 */

/** dismissPortaledOverlays / 进「我的」兜底共用选择器 */
export const SHEET_OVERLAY_DISMISS_SELECTORS = [
  '.sheet-backdrop',
  '.reader-sheet-backdrop',
  '.im-msg-popover-backdrop',
  '.version-pop-backdrop',
  '.reader-loc-backdrop',
  '.reader-ai-backdrop',
  '.book-complete-overlay',
  '[data-dismiss-on-tab-nav]',
] as const;

/** 派发 Tab 切换关闭事件（各 sheet 的 useCloseOnTabNav 会听） */
export function emitSheetTabNavClose(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('presto-tab-nav'));
  } catch {
    /* ignore */
  }
}

/** 点击现有遮罩节点以触发其 onClick（无 onClick 的历史遮罩点了也无效） */
export function clickSheetOverlayNodes(root: ParentNode = document): void {
  try {
    root.querySelectorAll(SHEET_OVERLAY_DISMISS_SELECTORS.join(',')).forEach((node) => {
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
 * 关掉挂在 body 上的半屏（Tab 保活切换时调用）。
 * 禁止 rAF 二次 fire：用户切到「我的」后立刻点设置会被下一帧关掉。
 */
export function dismissPortaledOverlays(): void {
  if (typeof document === 'undefined') return;
  emitSheetTabNavClose();
  clickSheetOverlayNodes(document);
}

/**
 * 清掉直接挂在 body 下、且不在 portal 层内的遗留遮罩
 *（旧 WebOnboarding / 未 portal 的全局 sheet）。
 */
export function dismissOrphanBodySheetBackdrops(): void {
  if (typeof document === 'undefined') return;
  try {
    Array.from(document.body.children).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.hasAttribute('data-app-body-portal')) return;
      const isBackdrop =
        node.classList.contains('sheet-backdrop')
        || node.classList.contains('reader-sheet-backdrop')
        || node.classList.contains('book-complete-overlay');
      if (!isBackdrop) return;
      try {
        node.click();
      } catch {
        /* ignore */
      }
      // 无 onClick 的僵尸遮罩：直接卸掉，避免永久吞点击
      if (node.isConnected) {
        try {
          node.remove();
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    /* ignore */
  }
}

/** 进入「我的」等身份页时的触摸锁清理 */
export function clearAssistantTouchLocks(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.remove(
    'assistant-keyboard',
    'assistant-keyboard-vv',
    'assistant-active',
  );
  document.documentElement.style.removeProperty('--assistant-vv-h');
  document.documentElement.style.removeProperty('--assistant-kb-inset');
}
