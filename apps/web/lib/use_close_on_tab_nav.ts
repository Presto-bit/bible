/** 半屏 / 浮层在 Tab 保活切换时自动关闭（portal 挂 body 会「串 Tab」） */

import { useEffect, useRef } from 'react';

/**
 * 主 Tab 切换或浏览器返回时调用 onClose。
 * 用于 createPortal / AppBodyPortal 的 sheet（词典、小爱 FAB、头像选择等）。
 *
 * @param graceMs 挂载后短时忽略 close（避免 tab 切换 rAF 残留 dismiss 立刻关掉刚打开的 sheet）
 */
export function useCloseOnTabNav(onClose: () => void, enabled = true, graceMs = 160): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const readyAt = Date.now() + Math.max(0, graceMs);
    const close = () => {
      if (Date.now() < readyAt) return;
      try {
        closeRef.current();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('presto-tab-nav', close);
    window.addEventListener('popstate', close);
    return () => {
      window.removeEventListener('presto-tab-nav', close);
      window.removeEventListener('popstate', close);
    };
  }, [enabled, graceMs]);
}
