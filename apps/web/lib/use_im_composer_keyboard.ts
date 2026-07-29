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

function findComposerBar(): HTMLElement | null {
  const bar =
    document.querySelector('.im-composer-bar.im-composer-dock')
    || document.querySelector('.dm-composer-dock')
    || document.querySelector('.group-wechat-composer');
  return bar instanceof HTMLElement ? bar : null;
}

function measureComposerHeight(): number {
  const bar = findComposerBar();
  if (!bar) return 64;
  return Math.max(48, Math.round(bar.getBoundingClientRect().height));
}

function writeComposerHeight(px: number) {
  document.documentElement.style.setProperty(
    '--im-composer-h',
    `${Math.max(48, Math.round(px))}px`,
  );
}

/**
 * 持续同步输入栏实测高度到 --im-composer-h（含 ➕ / @ / 回复条变高），
 * 供会话壳 padding-bottom 与键盘态共用，避免写死 140px。
 */
export function useImComposerHeightSync(
  barRef?: { current: HTMLElement | null },
) {
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;

    const apply = () => {
      const el = barRef?.current ?? findComposerBar();
      if (!el) return;
      writeComposerHeight(el.getBoundingClientRect().height);
    };

    const attach = () => {
      const el = barRef?.current ?? findComposerBar();
      if (!el || el === observed) {
        apply();
        return;
      }
      ro?.disconnect();
      observed = el;
      ro = new ResizeObserver(() => apply());
      ro.observe(el);
      apply();
    };

    attach();
    const t1 = window.setTimeout(attach, 80);
    const t2 = window.setTimeout(attach, 320);
    window.addEventListener('resize', apply);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', apply);
      ro?.disconnect();
    };
  }, [barRef]);
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
 * - resizes-content（viewport.interactiveWidget）：layout 已缩，壳用 top/bottom:0 填满即可
 * - overlays：layout 仍全屏，才用 visualViewport 锁壳（--im-vv-*），避免输入栏沉到键盘下
 * - 切勿在 resizes-content 下用偏大的 vv.height 锁壳高（会把底栏顶进键盘）
 * - 输入栏文档流贴壳底；列表 scrollTop 滚到底
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
      body.classList.remove('im-keyboard', 'im-keyboard-overlay');
      root.style.removeProperty('--im-kb-inset');
      // --im-composer-h 由 useImComposerHeightSync 持续维护，失焦不清除
      root.style.removeProperty('--im-vv-top');
      root.style.removeProperty('--im-vv-h');
    };

    const readLayout = () => {
      const layoutH = window.innerHeight || root.clientHeight || 0;
      const vvH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;
      const gap = Math.max(0, Math.round(layoutH - vvH - offsetTop));
      return { layoutH, vvH, offsetTop, gap };
    };

    /**
     * 键盘高度：
     * - overlays：layout 不变、vv 变矮 → gap
     * - resizes-content：layout≈vv → 用冻结 baseline - min(layout, vv)
     */
    const measureKeyboard = () => {
      pinScrollTop();
      const { layoutH, vvH, gap } = readLayout();
      if (gap > 8) return gap;

      // layout 已随键盘收缩时，用较小边对比 baseline，避免 stale vv 偏大算成 0
      const visibleH = Math.min(layoutH, Math.round(vvH));
      const base = baselineHRef.current || layoutH;
      const fromBase = Math.max(0, Math.round(base - visibleH));
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
      const { layoutH, vvH, offsetTop, gap } = readLayout();
      // overlays：layout 比可视区明显更高；resizes-content：二者接近，勿锁 vv
      const overlay = gap > 8;
      const vvTop = Math.max(0, Math.round(offsetTop));
      // 壳高取 layout / vv 较小值，防止 vv 滞后时报得过大、底栏钻进键盘
      const shellH = Math.max(240, Math.min(Math.round(vvH), layoutH - vvTop));

      setInset(next);
      body.classList.add('im-keyboard');
      body.classList.toggle('im-keyboard-overlay', overlay);
      root.style.setProperty('--im-kb-inset', `${next}px`);

      if (overlay) {
        root.style.setProperty('--im-vv-h', `${shellH}px`);
        root.style.setProperty('--im-vv-top', `${vvTop}px`);
      } else {
        // 交给 top/bottom:0 跟随已缩小的 layout viewport
        root.style.removeProperty('--im-vv-h');
        root.style.removeProperty('--im-vv-top');
      }
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
