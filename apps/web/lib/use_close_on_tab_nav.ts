/** 半屏 / 浮层在 Tab 保活切换时自动关闭（portal 挂 body 会「串 Tab」） */

import { useEffect, useRef } from 'react';

/**
 * 主 Tab 切换或浏览器返回时调用 onClose。
 * 用于 createPortal / AppBodyPortal 的 sheet（词典、小爱 FAB、头像选择等）。
 */
export function useCloseOnTabNav(onClose: () => void, enabled = true): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const close = () => {
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
  }, [enabled]);
}
