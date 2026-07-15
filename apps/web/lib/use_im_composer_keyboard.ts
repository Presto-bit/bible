'use client';

import { useEffect, useState } from 'react';

/**
 * IM 会话键盘顶起：visualViewport 算 inset，写入 --im-kb-inset，
 * 供固定底栏 composer 贴在键盘上方（对齐助手 Tab / 微信）。
 */
export function useImComposerKeyboard(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) {
      setInset(0);
      document.body.classList.remove('im-keyboard');
      document.documentElement.style.removeProperty('--im-kb-inset');
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const layoutH = window.innerHeight || root.clientHeight || 0;
        const vvH = vv?.height ?? layoutH;
        const offsetTop = vv?.offsetTop ?? 0;
        const gap = Math.max(0, Math.round(layoutH - (vvH + offsetTop)));
        const next = gap > 48 ? gap : 0;
        setInset(next);
        if (next > 0) {
          body.classList.add('im-keyboard');
          root.style.setProperty('--im-kb-inset', `${next}px`);
          // 避免整页被顶飞
          window.scrollTo(0, 0);
        } else {
          body.classList.remove('im-keyboard');
          root.style.removeProperty('--im-kb-inset');
        }
      });
    };

    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    sync();

    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      body.classList.remove('im-keyboard');
      root.style.removeProperty('--im-kb-inset');
    };
  }, [active]);

  return inset;
}
