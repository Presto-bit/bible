/** 半屏 / 浮层在 Tab 保活切换时自动关闭（portal 挂 body 会「串 Tab」） */

import { useEffect, useRef } from 'react';

/**
 * 主 Tab 切换时调用 onClose。
 * 注意：默认不再监听 popstate——安卓 WebView / 壳偶发会发 popstate，
 * 导致刚打开的设置/词典立刻被关掉，表现为「点了没反应」。
 *
 * @param graceMs 挂载后短时忽略 close（避免 tab 切换 dismiss 立刻关掉刚打开的 sheet）
 */
export function useCloseOnTabNav(onClose: () => void, enabled = true, graceMs = 200): void {
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
    return () => {
      window.removeEventListener('presto-tab-nav', close);
    };
  }, [enabled, graceMs]);
}
