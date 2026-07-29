'use client';

import { useEffect, useRef, useState } from 'react';

function pinScrollTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

export function scrollImChatToBottom(el: HTMLElement | null | undefined) {
  if (!el) return;
  const pin = () => {
    el.scrollTop = el.scrollHeight;
    const last = el.querySelector('[data-mid]:last-of-type');
    if (last instanceof HTMLElement) {
      last.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
  };
  // 多帧 + 短延迟：等 vv 壳 / composer 高度写入后再滚
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(() => {
      pin();
      window.setTimeout(pin, 60);
      window.setTimeout(pin, 180);
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
 * IM 键盘贴合（对齐小爱）：
 * - 把会话壳绑到 visualViewport（--im-vv-top / --im-vv-h）
 * - 输入栏改在壳内贴底，避免 fixed + 错误 kb-inset 被键盘挡住
 * - 列表只为 composer 高度留白；键盘动画期多次滚底
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
      root.style.removeProperty('--im-vv-top');
      root.style.removeProperty('--im-vv-h');
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
      scrollImChatToBottom(getScrollElRef.current?.() ?? null);
    };

    const applyViewportChrome = (gap: number) => {
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      const next = gap > 8 ? gap : 0;

      setInset(next);
      body.classList.add('im-keyboard');
      root.style.setProperty('--im-kb-inset', `${next}px`);
      // 无论 resizes-content 是否生效，都把壳压进可见视口
      root.style.setProperty('--im-vv-top', `${Math.max(0, Math.round(offsetTop))}px`);
      root.style.setProperty('--im-vv-h', `${Math.max(120, Math.round(vvH))}px`);
      pinChat();
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyViewportChrome(measureGap()));
    };

    if (!active) {
      // 失焦后短轮询：等键盘收起动画再清 chrome
      let n = 0;
      const gap0 = measureGap();
      if (gap0 <= 8) {
        clearChrome();
        pinScrollTop();
      } else {
        applyViewportChrome(gap0);
        poll = window.setInterval(() => {
          n += 1;
          const gap = measureGap();
          if (gap <= 8 || n > 28) {
            if (poll) window.clearInterval(poll);
            poll = undefined;
            clearChrome();
            pinScrollTop();
            return;
          }
          applyViewportChrome(gap);
        }, 50);
      }
    } else {
      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      sync();
      for (const ms of [50, 120, 220, 380, 560, 800, 1100, 1500]) {
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
      clearChrome();
      pinScrollTop();
    };
  }, [active]);

  return inset;
}
