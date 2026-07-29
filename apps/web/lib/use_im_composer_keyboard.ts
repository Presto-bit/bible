'use client';

import { useEffect, useRef, useState } from 'react';

function pinScrollTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

/**
 * 滚到会话底：只改滚动容器 scrollTop，避免 scrollIntoView
 * 在 iOS 上连带顶起 visualViewport / 把输入框顶到键盘下。
 */
export function scrollImChatToBottom(el: HTMLElement | null | undefined) {
  if (!el) return;
  const pin = () => {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = max;
  };
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(() => {
      pin();
      window.setTimeout(pin, 60);
      window.setTimeout(pin, 180);
      window.setTimeout(pin, 360);
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

function readViewportHeight(): number {
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const vvH = window.visualViewport?.height ?? layoutH;
  return Math.max(layoutH, vvH);
}

export type ImComposerKeyboardOpts = {
  /** 聊天滚动容器（群 .group-checkin-scroll / 私信 .dm-msg-list） */
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合（群 / 私信共用）：
 * - 以 visualViewport 高度锁定会话壳（overlays / resizes-content 都能贴住键盘上沿）
 * - 顶栏不跟 offsetTop 上移
 * - 输入栏贴壳底；列表 scrollTop 滚到底，末条落在输入框上方
 */
export function useImComposerKeyboard(
  active: boolean,
  opts?: ImComposerKeyboardOpts,
) {
  const [inset, setInset] = useState(0);
  const getScrollElRef = useRef(opts?.getScrollEl);
  getScrollElRef.current = opts?.getScrollEl;
  /** 键盘未开时的可视高度；聚焦后冻结，用于推算键盘高度 */
  const baselineHRef = useRef(0);

  // 失焦时持续刷新 baseline，保证下次聚焦前是「全屏」高度
  useEffect(() => {
    if (active) return;
    const refresh = () => {
      baselineHRef.current = readViewportHeight();
    };
    refresh();
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, [active]);

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

    /**
     * 键盘高度：
     * - overlays：layout 不变、vv 变矮 → gap
     * - resizes-content：layout≈vv → 用冻结 baseline - vvH
     */
    const measureKeyboard = () => {
      pinScrollTop();
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      const gap = Math.max(0, Math.round(layoutH - vvH - offsetTop));
      if (gap > 8) return gap;

      const base = baselineHRef.current || layoutH;
      const fromBase = Math.max(0, Math.round(base - vvH));
      return fromBase > 48 ? fromBase : 0;
    };

    const applyComposerH = () => {
      root.style.setProperty('--im-composer-h', `${measureComposerHeight()}px`);
    };

    const pinChat = () => {
      applyComposerH();
      scrollImChatToBottom(getScrollElRef.current?.() ?? null);
    };

    const applyChrome = (kb: number) => {
      const next = kb > 8 ? kb : 0;
      const vvH = Math.round(vv?.height ?? window.innerHeight ?? 0);
      const vvTop = Math.round(vv?.offsetTop ?? 0);
      setInset(next);
      body.classList.add('im-keyboard');
      root.style.setProperty('--im-kb-inset', `${next}px`);
      // 壳高度锁定到可视区，避免 overlays 下 fixed 底栏沉到键盘下、
      // 也避免 resizes-content 下再叠加 bottom:kb 造成双倍抬升
      root.style.setProperty('--im-vv-h', `${Math.max(240, vvH)}px`);
      root.style.setProperty('--im-vv-top', `${Math.max(0, vvTop)}px`);
      pinChat();
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyChrome(measureKeyboard()));
    };

    if (!active) {
      let n = 0;
      const kb0 = measureKeyboard();
      if (kb0 <= 8) {
        clearChrome();
        pinScrollTop();
      } else {
        applyChrome(kb0);
        poll = window.setInterval(() => {
          n += 1;
          const kb = measureKeyboard();
          if (kb <= 8 || n > 28) {
            if (poll) window.clearInterval(poll);
            poll = undefined;
            clearChrome();
            pinScrollTop();
            return;
          }
          applyChrome(kb);
        }, 50);
      }
    } else {
      if (!baselineHRef.current) {
        baselineHRef.current = readViewportHeight();
      }
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
