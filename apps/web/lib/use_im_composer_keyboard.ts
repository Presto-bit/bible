'use client';

import { useEffect, useRef, useState } from 'react';

function pinScrollTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

function scrollChatToBottom(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

export type ImComposerKeyboardOpts = {
  /** 聊天滚动容器（群 .group-checkin-scroll / 私信 .dm-msg-list） */
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合（对齐微信）：
 * - layout 使用 interactive-widget: resizes-content 时，fixed bottom:0 已在键盘上方，
 *   仅在 visualViewport 仍有额外 gap（如 accessory / 未完全 resize）时再抬一次。
 * - 失焦后继续跟 VV，直到 inset 归零，避免「取消激活后输入框上移」。
 * - 键盘升起时把聊天区滚到底，避免最新消息被挡。
 */
export function useImComposerKeyboard(
  active: boolean,
  opts?: ImComposerKeyboardOpts,
) {
  const [inset, setInset] = useState(0);
  const getScrollElRef = useRef(opts?.getScrollEl);
  getScrollElRef.current = opts?.getScrollEl;

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;
    let poll: number | undefined;
    const followTimers: number[] = [];

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

    const pinChat = () => {
      pinScrollTop();
      scrollChatToBottom(getScrollElRef.current?.() ?? null);
    };

    const apply = (gap: number) => {
      const next = gap > 8 ? gap : 0;
      if (active) {
        setInset(next);
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', `${next}px`);
        pinChat();
        return;
      }
      if (next > 0) {
        setInset(next);
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', `${next}px`);
        pinChat();
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
      sync();
      let n = 0;
      poll = window.setInterval(() => {
        n += 1;
        const gap = measureGap();
        apply(gap);
        if (gap <= 8 || n > 28) {
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
      for (const ms of [80, 220, 400]) {
        followTimers.push(window.setTimeout(sync, ms));
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      if (poll) window.clearInterval(poll);
      for (const t of followTimers) window.clearTimeout(t);
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
