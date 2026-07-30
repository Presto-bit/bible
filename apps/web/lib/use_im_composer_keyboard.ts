'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * iOS PWA 键盘：interactive-widget=resizes-content。
 * 壳始终 bottom:0；overlays 仅用 transform。
 * 失焦只做轻量清理，避免反复改 html/body height 卡死主线程、吞掉点击。
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
    requestAnimationFrame(pin);
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

function hasKeyboardChromeResidue(): boolean {
  const root = document.documentElement;
  const body = document.body;
  if (body.classList.contains('im-keyboard') || body.classList.contains('im-keyboard-overlay')) {
    return true;
  }
  if (root.style.getPropertyValue('--im-kb-inset')) return true;
  if (root.style.height || body.style.height) return true;
  const vv = window.visualViewport;
  if (vv && vv.offsetTop > 2) return true;
  return false;
}

/** 轻量清键盘残留：不改写 html/body 高度，避免离开聊天后整 App 卡顿、点击失灵 */
export function clearImKeyboardLift() {
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove('im-keyboard', 'im-keyboard-overlay', 'im-plus-sheet', 'im-mention-sheet');
  root.style.removeProperty('--im-kb-inset');
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  // 清掉可能卡住的高度锁（勿再主动写入 height）
  root.style.removeProperty('height');
  body.style.removeProperty('height');
  if (!isComposerFieldFocused()) pinScrollTop(true);
}

/**
 * 仅在确实有残留时做一次轻 nudge；禁止连环 setTimeout + 强制 reflow。
 */
function softViewportRestore() {
  clearImKeyboardLift();
  if (!hasKeyboardChromeResidue() && !(window.visualViewport && window.visualViewport.offsetTop > 2)) {
    return;
  }
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  if (top > 0) {
    window.scrollTo(0, 0);
  }
  pinScrollTop(true);
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
 * - resizes-content：只打 im-keyboard（藏 sticky），壳贴底
 * - overlays：transform + --im-kb-inset
 * - 失焦：轻量 soft restore（最多再补一次），绝不连打 5 次强制 reflow
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
    let followTimer: number | undefined;
    let settleTimer: number | undefined;

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
      softViewportRestore();
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
      // 仅再补一次（键盘收起动画末尾），禁止 5 连发
      settleTimer = window.setTimeout(() => {
        if (isComposerFieldFocused()) return;
        if (hasKeyboardChromeResidue()) softViewportRestore();
      }, 280);
    } else {
      if (!baselineRef.current) baselineRef.current = readBaseline();
      resizeModeRef.current = false;
      appliedOverlayRef.current = 0;

      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      sync();
      followTimer = window.setTimeout(sync, 320);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (followTimer) window.clearTimeout(followTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      if (active) settle();
    };
  }, [active]);

  return inset;
}

/** @deprecated 预抬易导致悬空，保留空实现 */
export function previewImKeyboardLift() {
  /* no-op */
}
