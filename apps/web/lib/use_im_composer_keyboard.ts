'use client';

import { useEffect, useState } from 'react';

/**
 * IM 会话键盘顶起：visualViewport 算 inset，写入 --im-kb-inset，
 * 固定底栏贴在键盘上方（对齐微信，无额外抬升空隙）。
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
        // 键盘占位：布局高度 − 可视区域底边；略收 1px 避免亚像素缝
        const gap = Math.max(0, Math.round(layoutH - (vvH + offsetTop) - 1));
        const next = gap > 24 ? gap : 0;
        setInset(next);
        if (next > 0) {
          body.classList.add('im-keyboard');
          root.style.setProperty('--im-kb-inset', `${next}px`);
          window.scrollTo(0, 0);
          root.scrollTop = 0;
          body.scrollTop = 0;
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
