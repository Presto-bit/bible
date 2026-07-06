'use client';

import { useEffect, useState } from 'react';

/** 键盘顶起底部 sheet，避免输入框与操作按钮被遮挡 */
export function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(next > 40 ? next : 0);
      setViewportHeight(Math.round(vv.height));
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    sync();
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return { inset, viewportHeight };
}
