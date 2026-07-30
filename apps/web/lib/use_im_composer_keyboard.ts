'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * iOS PWA 键盘：站点用 interactive-widget=resizes-content。
 * 壳始终 bottom:0，勿再用 --im-kb-inset 抬底（收起后易残留悬空白边）。
 * overlays 兜底只用 transform 上移，失焦必清并强制视口复位。
 */

function isImBottomSheet(): boolean {
  const body = document.body;
  return body.classList.contains('im-plus-sheet')
    || body.classList.contains('im-mention-sheet');
}

function isComposerFieldFocused(): boolean {
  const ae = document.activeElement;
  if (!(ae instanceof HTMLElement)) return false;
  return Boolean(
    ae.closest('.im-composer-bar, .group-wechat-composer, .dm-composer-dock'),
  );
}

function pinScrollTop(force = false) {
  if (!force && isComposerFieldFocused()) return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

/** 同一容器短时多次滚底合并 */
const scrollBottomLastAt = new WeakMap<HTMLElement, number>();

export function scrollImChatToBottom(
  el: HTMLElement | null | undefined,
  opts?: { gentle?: boolean },
) {
  if (!el) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = scrollBottomLastAt.get(el) ?? 0;
  if (now - last < (opts?.gentle ? 120 : 64)) return;
  scrollBottomLastAt.set(el, now);
  const pin = () => {
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = max;
  };
  if (opts?.gentle) {
    requestAnimationFrame(pin);
    return;
  }
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(() => {
      pin();
      window.setTimeout(pin, 80);
      window.setTimeout(pin, 200);
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

function clearTabbarInline() {
  const tab = document.querySelector('.tabbar');
  if (!(tab instanceof HTMLElement)) return;
  tab.style.removeProperty('transform');
  tab.style.removeProperty('bottom');
  tab.style.removeProperty('top');
  tab.style.removeProperty('opacity');
  tab.style.removeProperty('visibility');
}

/**
 * iOS PWA 收起键盘后 layout/vv 常卡住：强制滚回 + 清高度锁 + 轻 nudge。
 */
function forceViewportRestore() {
  const root = document.documentElement;
  const body = document.body;
  const vv = window.visualViewport;

  pinScrollTop(true);

  // 清可能残留的键盘变量与 class
  body.classList.remove('im-keyboard', 'im-keyboard-overlay');
  root.style.removeProperty('--im-kb-inset');
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  clearTabbarInline();

  // 用当前 innerHeight 顶一下，促使 iOS 重新计算 layout viewport
  const h = window.innerHeight || root.clientHeight || 0;
  if (h > 0) {
    root.style.height = `${h}px`;
    body.style.height = `${h}px`;
  }
  void root.offsetHeight;

  // nudge：部分 iOS 要先滚一下再回 0 才会撤掉 vv.offsetTop
  const top = vv?.offsetTop ?? 0;
  if (top > 0) {
    window.scrollTo(0, top);
  }
  window.scrollTo(0, 0);
  root.scrollTop = 0;
  body.scrollTop = 0;

  root.style.removeProperty('height');
  body.style.removeProperty('height');
  clearTabbarInline();
}

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

function readBaseline(): number {
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const vvH = window.visualViewport?.height ?? layoutH;
  return Math.max(layoutH, vvH);
}

/** overlays：layout 几乎不变、vv 明显变矮 */
function readOverlayGap(): number {
  const vv = window.visualViewport;
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const vvH = vv?.height ?? layoutH;
  const vvTop = vv?.offsetTop ?? 0;
  return Math.max(0, Math.round(layoutH - vvH - vvTop));
}

export type ImComposerKeyboardOpts = {
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合：
 * - resizes-content：只打 im-keyboard（藏 sticky/改 padding），壳始终贴底
 * - overlays：用 transform 上移壳（--im-kb-inset），不用 bottom 抬升
 * - 失焦：强制视口复位，清掉 class / 变量 / tabbar 内联样式
 */
export function useImComposerKeyboard(
  active: boolean,
  opts?: ImComposerKeyboardOpts,
) {
  const [inset, setInset] = useState(0);
  const getScrollElRef = useRef(opts?.getScrollEl);
  getScrollElRef.current = opts?.getScrollEl;
  const baselineRef = useRef(0);
  const resizeModeRef = useRef(false);
  const appliedOverlayRef = useRef(0);

  useEffect(() => {
    if (active) return;
    const refresh = () => {
      baselineRef.current = readBaseline();
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
    const timers: number[] = [];

    const clearChrome = () => {
      setInset(0);
      appliedOverlayRef.current = 0;
      body.classList.remove('im-keyboard', 'im-keyboard-overlay');
      root.style.removeProperty('--im-kb-inset');
      root.style.removeProperty('--im-vv-top');
      root.style.removeProperty('--im-vv-h');
    };

    const settle = () => {
      resizeModeRef.current = false;
      clearChrome();
      forceViewportRestore();
    };

    const applyOpenChrome = (overlayPx: number) => {
      if (isImBottomSheet()) {
        clearChrome();
        return;
      }
      body.classList.add('im-keyboard');
      if (overlayPx > 48) {
        const next = Math.min(overlayPx, Math.round((window.innerHeight || 600) * 0.45));
        if (Math.abs(next - appliedOverlayRef.current) < 10 && appliedOverlayRef.current > 0) {
          return;
        }
        appliedOverlayRef.current = next;
        setInset(next);
        body.classList.add('im-keyboard-overlay');
        root.style.setProperty('--im-kb-inset', `${next}px`);
      } else {
        appliedOverlayRef.current = 0;
        setInset(0);
        body.classList.remove('im-keyboard-overlay');
        root.style.setProperty('--im-kb-inset', '0px');
      }
      writeComposerHeight(measureComposerHeight());
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isImBottomSheet()) {
          clearChrome();
          return;
        }
        const base = baselineRef.current || readBaseline();
        const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
        const layoutShrunk = base - layoutH > 40;
        if (layoutShrunk) resizeModeRef.current = true;

        if (resizeModeRef.current) {
          // resizes-content：layout 已缩就标键盘态；涨回去则清（仍聚焦也清抬升）
          if (layoutShrunk) {
            applyOpenChrome(0);
            scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
          } else {
            clearChrome();
          }
          return;
        }

        const gap = readOverlayGap();
        if (gap > 48) {
          applyOpenChrome(gap);
          scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
        } else {
          clearChrome();
        }
      });
    };

    if (!active) {
      settle();
      // iOS 收起动画途中要连打几次，否则 layout 卡在键盘高度
      for (const ms of [50, 120, 250, 450, 700]) {
        timers.push(
          window.setTimeout(() => {
            if (isComposerFieldFocused()) return;
            settle();
          }, ms),
        );
      }
    } else {
      if (!baselineRef.current) baselineRef.current = readBaseline();
      resizeModeRef.current = false;
      appliedOverlayRef.current = 0;

      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      sync();
      for (const ms of [100, 280, 520]) {
        timers.push(window.setTimeout(sync, ms));
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      for (const t of timers) window.clearTimeout(t);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      if (active) settle();
    };
  }, [active]);

  return inset;
}

/** @deprecated 预抬易导致 iOS 悬空，保留空实现兼容调用方 */
export function previewImKeyboardLift() {
  /* no-op */
}

export function clearImKeyboardLift() {
  forceViewportRestore();
}
