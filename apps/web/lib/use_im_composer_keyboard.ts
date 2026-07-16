'use client';

import { useEffect, useState } from 'react';

function pinScrollTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

/**
 * IM 键盘贴合（对齐微信）：
 * - layout 使用 interactive-widget: resizes-content 时，fixed bottom:0 已在键盘上方，
 *   仅在 visualViewport 仍有额外 gap（如 accessory / 未完全 resize）时再抬一次。
 * - 失焦后继续跟 VV，直到 inset 归零，避免「取消激活后输入框上移」。
 */
export function useImComposerKeyboard(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;
    let poll: number | undefined;

    const clearChrome = () => {
      setInset(0);
      body.classList.remove('im-keyboard');
      root.style.removeProperty('--im-kb-inset');
    };

    const measureGap = () => {
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      return Math.max(0, Math.round(layoutH - (vvH + offsetTop)));
    };

    const apply = (gap: number) => {
      // resizes-content 下 gap 通常很小；仅显著 gap 才抬底栏
      const next = gap > 40 ? gap : 0;
      if (next > 0) {
        setInset(next);
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', `${next}px`);
        pinScrollTop();
      } else {
        clearChrome();
        pinScrollTop();
      }
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(measureGap()));
    };

    if (!active) {
      // 失焦：短轮询跟完键盘收起，再清干净
      sync();
      let n = 0;
      poll = window.setInterval(() => {
        n += 1;
        const gap = measureGap();
        apply(gap);
        if (gap <= 40 || n > 28) {
          if (poll) window.clearInterval(poll);
          poll = undefined;
          clearChrome();
          pinScrollTop();
        }
      }, 50);
    } else {
      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      sync();
    }

    return () => {
      cancelAnimationFrame(raf);
      if (poll) window.clearInterval(poll);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      if (!active) {
        clearChrome();
        pinScrollTop();
      }
    };
  }, [active]);

  return inset;
}
