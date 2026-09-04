/**
 * 全屏半屏遮罩统一策略（TWA / PWA 通用）：
 * 1) 遮罩必须可点关（Pressable/shellTap 或 onClick → onClose）
 * 2) 切主 Tab 可关（data-dismiss-on-tab-nav + presto-tab-nav / onTabAway）
 * 3) 必须挂 AppBodyPortal（层内 backdrop = absolute 填满，勿裸 createPortal 到 body）
 * 4) 高度/安全区用 --safe-top/bottom（含壳 --shell-inset），勿裸 env()/80vh
 * 5) 切 Tab / 壳 resume 时 purge，避免透明层永久吞全站点击
 * 6) 五 Tab chrome / 开层主 CTA 用 Pressable（见 components/ui/Pressable），勿裸 onClick 指望安卓合成
 */

/** dismiss / hard-remove 共用选择器（含透明吞点击层） */
export const SHEET_OVERLAY_DISMISS_SELECTORS = [
  '.sheet-backdrop',
  '.reader-sheet-backdrop',
  '.im-msg-popover-backdrop',
  '.shelf-book-action-backdrop',
  '.shelf-sheet-backdrop',
  '.version-pop-backdrop',
  '.reader-loc-backdrop',
  '.reader-ai-backdrop',
  '.book-complete-overlay',
  '.plus-menu-backdrop',
  '.drawer-backdrop',
  '.im-chat-search-backdrop',
  '.im-lightbox-backdrop',
  '.im-file-preview-backdrop',
  '.im-video-player-backdrop',
  '.admin-cmd-backdrop',
  '[data-dismiss-on-tab-nav]',
  '[data-shell-touch-blocker]',
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
        || node.classList.contains('book-complete-overlay')
        || node.classList.contains('plus-menu-backdrop');
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
    'assistant-immersive',
    'assistant-tabbar-peek',
  );
  document.documentElement.style.removeProperty('--assistant-vv-h');
  document.documentElement.style.removeProperty('--assistant-vv-top');
  document.documentElement.style.removeProperty('--assistant-kb-inset');
  document.documentElement.style.removeProperty('--assistant-page-h');
  document.documentElement.style.removeProperty('--assistant-overlay-h');
}

/** 非读经场景下可能残留的 body 键盘/IM 锁（整站 pointer-events / 滚动） */
export function clearStrandedBodyTouchLocks(opts?: {
  /** true=尝试关闭内嵌外链浏览器；false=仅在 class 孤悬时剥锁 */
  forceExternal?: boolean;
}): void {
  if (typeof document === 'undefined') return;
  const forceExternal = opts?.forceExternal !== false;

  document.body.classList.remove(
    'im-keyboard',
    'im-keyboard-overlay',
    'im-plus-sheet',
    'im-mention-sheet',
    'im-vv-shell',
  );
  document.documentElement.style.removeProperty('--im-kb-inset');
  document.documentElement.style.removeProperty('--im-composer-h');

  clearAssistantTouchLocks();

  if (forceExternal) {
    try {
      const closeBtn = document.querySelector<HTMLElement>(
        '.external-browser .external-browser-close',
      );
      if (closeBtn) closeBtn.click();
    } catch {
      /* ignore */
    }
  }
  // class 孤悬（无 DOM）会永久 pointer-events:none 整站 → 必须剥
  if (!document.querySelector('.external-browser')) {
    document.documentElement.classList.remove('external-browser-open');
    document.body.classList.remove('external-browser-open');
  }
}

/**
 * click / tab-nav 仍挂在 DOM 上的「隐蔽」吞点击层：硬卸掉。
 * 只动透明/无业务壳层；标准 .sheet-backdrop 交给 React onClick（避免 resume 误杀）。
 */
export function hardRemoveBlockingOverlays(): void {
  if (typeof document === 'undefined') return;
  const hardSelectors = [
    '.plus-menu-backdrop',
    '.admin-cmd-backdrop',
    '.soft-nav-pending-overlay',
    '[data-shell-touch-blocker]:not(.external-browser)',
  ].join(',');

  try {
    document.querySelectorAll(hardSelectors).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      // external-browser 走 close 按钮，不硬卸
      if (node.classList.contains('external-browser')) return;
      try {
        node.remove();
      } catch {
        /* ignore */
      }
    });

    // 卸空 portal 层：残留空 fixed 层在部分 WebView 仍会参与命中测试
    document.querySelectorAll('[data-app-body-portal]').forEach((layer) => {
      if (!(layer instanceof HTMLElement)) return;
      if (layer.childElementCount === 0) {
        try {
          layer.remove();
        } catch {
          /* ignore */
        }
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * 壳 / 保活 Tab：一键卸除「点了没反应」类触摸锁。
 * - 先走 React 契约（tab-nav + click）
 * - 再 hard remove 残留
 * - 最后清 body class（含 external-browser-open）
 */
export function purgeShellTouchBlockers(): void {
  if (typeof document === 'undefined') return;
  dismissPortaledOverlays();
  dismissOrphanBodySheetBackdrops();
  hardRemoveBlockingOverlays();
  clearStrandedBodyTouchLocks({ forceExternal: true });
  if (!document.querySelector('.external-browser')) {
    document.documentElement.classList.remove('external-browser-open');
    document.body.classList.remove('external-browser-open');
  }
}

/** 多任务回前台：只卸透明吞点击层 + 孤悬 class，不强关用户半屏/外链页 */
export function softRecoverShellTouch(): void {
  if (typeof document === 'undefined') return;
  try {
    document.querySelectorAll('.plus-menu-backdrop').forEach((node) => {
      if (node instanceof HTMLElement) {
        try {
          node.click();
        } catch {
          /* ignore */
        }
        if (node.isConnected) {
          try {
            node.remove();
          } catch {
            /* ignore */
          }
        }
      }
    });
  } catch {
    /* ignore */
  }
  hardRemoveBlockingOverlays();
  clearStrandedBodyTouchLocks({ forceExternal: false });
}
