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
  // 双 rAF：等 padding / composer 高度先落地再滚
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  });
}

function measureComposerHeight(): number {
  const bar =
    document.querySelector('.im-composer-bar.im-composer-dock')
    || document.querySelector('.dm-composer-dock')
    || document.querySelector('.group-wechat-composer');
  if (!(bar instanceof HTMLElement)) return 64;
  return Math.max(48, Math.round(bar.getBoundingClientRect().height));
}

export type ImComposerKeyboardOpts = {
  /** 聊天滚动容器（群 .group-checkin-scroll / 私信 .dm-msg-list） */
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合：
 * - 标记 body.im-keyboard，写入 --im-kb-inset / --im-composer-h
 * - 键盘动画期间多次把聊天区滚到底，保证最后一条在输入框上方可见
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
      root.style.removeProperty('--im-composer-h');
    };

    const measureGap = () => {
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      return Math.max(0, Math.round(layoutH - (vvH + offsetTop)));
    };

    const applyComposerH = () => {
      root.style.setProperty('--im-composer-h', `${measureComposerHeight()}px`);
    };

    const pinChat = () => {
      pinScrollTop();
      applyComposerH();
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
      for (const ms of [50, 120, 220, 380, 560, 800]) {
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
