'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { isFlutterH5Host } from '@/lib/flutter_h5_bridge';

/**
 * iOS PWA IM 视口策略：
 *
 * - interactive-widget=resizes-content：多数情况下 layout 已随键盘收缩，壳应贴 layout，
 *   再按 visualViewport 缩小会造成「输入框上跳 / 与键盘脱节」。
 * - 少数机型 layout 卡住偏高：则用 vv.height（top 固定 0 + 锁文档滚动）兜底。
 * - 卸载时拆除 vv-shell，避免跨页残留。
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

function pinDocScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

const scrollBottomLastAt = new WeakMap<HTMLElement, number>();
let imPinLock = 0;

export function isImPinLocked(): boolean {
  return imPinLock > 0;
}

/** 同步贴到底。期间的 scroll 事件不算用户上翻。 */
export function pinImListToEnd(el: HTMLElement | null | undefined) {
  if (!el) return;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  if (Math.abs(el.scrollTop - max) < 1) return;
  imPinLock += 1;
  el.scrollTop = max;
  imPinLock -= 1;
}

export function scrollImChatToBottom(
  el: HTMLElement | null | undefined,
  opts?: { gentle?: boolean },
) {
  if (!el) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = scrollBottomLastAt.get(el) ?? 0;
  if (now - last < (opts?.gentle ? 120 : 64)) return;
  scrollBottomLastAt.set(el, now);
  const pin = () => pinImListToEnd(el);
  if (opts?.gentle) {
    pin();
    return;
  }
  pin();
  requestAnimationFrame(pin);
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

/** 清掉键盘相关 class / CSS 变量（不含拆除 vv-shell） */
export function clearImKeyboardLift() {
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove('im-keyboard', 'im-keyboard-overlay');
  if (!isFlutterH5Host()) {
    root.style.removeProperty('--im-kb-inset');
  }
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  root.style.removeProperty('--im-shell-kb-inset');
  root.style.removeProperty('height');
  body.style.removeProperty('height');
  if (!isComposerFieldFocused()) pinDocScroll();
}

/** 拆除 vv-shell 绑定并复位（离开聊天 / 回主 Tab） */
export function teardownImViewportShell() {
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove(
    'im-vv-shell',
    'im-keyboard',
    'im-keyboard-overlay',
    'im-plus-sheet',
    'im-mention-sheet',
  );
  root.style.removeProperty('--im-shell-top');
  root.style.removeProperty('--im-shell-h');
  if (!isFlutterH5Host()) {
    root.style.removeProperty('--im-kb-inset');
  }
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  root.style.removeProperty('--im-shell-kb-inset');
  root.style.removeProperty('height');
  body.style.removeProperty('height');
  pinDocScroll();
}

/**
 * 人在底部时，输入栏变高、消息变高、共读条开关都重新对齐到最后一条。
 * 已经上翻则不动。
 */
export function usePinChatToLatest(
  getEl: () => HTMLElement | null,
  stickRef: { current: boolean },
  watchKey: string,
  enabled = true,
) {
  const getElRef = useRef(getEl);
  getElRef.current = getEl;

  useEffect(() => {
    if (!enabled) return;
    const el = getElRef.current();
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!stickRef.current) return;
      pinImListToEnd(el);
    });
    ro.observe(el);
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) ro.observe(child);
    }
    return () => ro.disconnect();
  }, [enabled, stickRef, watchKey]);
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

export type ImComposerKeyboardOpts = {
  getScrollEl?: () => HTMLElement | null;
};

type ShellMetrics = { top: number; h: number; keyboardUp: boolean; kbInset: number };

const KB_SHRINK_PX = 28;

function readHostViewportHints(): { vvH: number; kbInset: number } | null {
  if (!isFlutterH5Host()) return null;
  const root = document.documentElement;
  const rawH = root.style.getPropertyValue('--im-vv-h')
    || getComputedStyle(root).getPropertyValue('--im-vv-h');
  const rawInset = root.style.getPropertyValue('--im-kb-inset')
    || getComputedStyle(root).getPropertyValue('--im-kb-inset');
  const vvH = parseFloat(rawH);
  const kbInset = parseFloat(rawInset);
  if (!Number.isFinite(vvH) && !Number.isFinite(kbInset)) return null;
  return {
    vvH: Number.isFinite(vvH) ? vvH : 0,
    kbInset: Number.isFinite(kbInset) ? Math.max(0, kbInset) : 0,
  };
}

/**
 * 计算聊天壳尺寸：
 * - layout 已随键盘收缩 → 贴 layout（避免与 vv 双重收缩导致上跳）
 * - layout 未收缩 / 卡住 → 用 vv.height，top 固定 0
 */
function computeShellMetrics(
  focused: boolean,
  openBaseline: number,
): ShellMetrics {
  const vv = window.visualViewport;
  const layoutH = Math.round(window.innerHeight || 0);
  const vvH = Math.round(vv?.height ?? layoutH);
  const vvTop = Math.max(0, Math.round(vv?.offsetTop ?? 0));
  const base = openBaseline || Math.max(layoutH, vvH + vvTop);

  const hostHints = focused ? readHostViewportHints() : null;
  if (
    hostHints
    && (hostHints.kbInset > 0 || document.body.classList.contains('android-flutter-kb'))
  ) {
    const h = hostHints.vvH > 120
      ? hostHints.vvH
      : Math.max(120, layoutH - hostHints.kbInset);
    return {
      top: 0,
      h,
      keyboardUp: true,
      kbInset: hostHints.kbInset,
    };
  }

  const layoutShrunk = base - layoutH > KB_SHRINK_PX;
  const vvOccluded = base - (vvH + vvTop) > KB_SHRINK_PX || base - vvH > KB_SHRINK_PX;
  const keyboardUp = Boolean(focused && (layoutShrunk || vvOccluded));

  if (!keyboardUp) {
    // 未开键盘：优先用 layout；若 layout 异常偏矮则跟 vv
    if (layoutH > 0 && (base - layoutH < 80 || !vv)) {
      return { top: 0, h: layoutH, keyboardUp: false, kbInset: 0 };
    }
    return { top: 0, h: Math.max(120, vvH), keyboardUp: false, kbInset: 0 };
  }

  if (layoutShrunk) {
    // layout 已正确收缩：不要再跟 offsetTop / 二次缩小
    return {
      top: 0,
      h: Math.max(120, layoutH),
      keyboardUp: true,
      kbInset: 0,
    };
  }

  // layout 卡住：仅用可视高度，强制 top=0 + 锁滚动，避免 offsetTop 把整壳顶飞
  const h = Math.max(120, vvH);
  const kbInset = Math.max(0, Math.round(base - h - vvTop));
  return { top: 0, h, keyboardUp: true, kbInset };
}

/**
 * 群 / 私信挂载期间驱动壳尺寸；
 * composerFocused 控制 im-keyboard（藏 sticky），不额外抬 bottom。
 */
export function useImComposerKeyboard(
  composerFocused: boolean,
  opts?: ImComposerKeyboardOpts,
) {
  const [inset, setInset] = useState(0);
  const getScrollElRef = useRef(opts?.getScrollEl);
  getScrollElRef.current = opts?.getScrollEl;
  const openBaselineRef = useRef(0);
  const lastShellRef = useRef({ top: -1, h: -1 });
  const focusedRef = useRef(composerFocused);
  focusedRef.current = composerFocused;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    body.classList.add('im-vv-shell');
    openBaselineRef.current = Math.round(
      Math.max(window.innerHeight || 0, vv?.height ?? 0),
    );
    const m = computeShellMetrics(focusedRef.current, openBaselineRef.current);
    lastShellRef.current = { top: m.top, h: m.h };
    root.style.setProperty('--im-shell-top', `${m.top}px`);
    root.style.setProperty('--im-shell-h', `${m.h}px`);
    root.style.setProperty('--im-kb-inset', '0px');
    root.style.setProperty('--im-shell-kb-inset', '0px');
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;

    body.classList.add('im-vv-shell');
    openBaselineRef.current = Math.round(
      Math.max(window.innerHeight || 0, vv?.height ?? 0),
    );

    const applyShell = (m: ShellMetrics) => {
      const prev = lastShellRef.current;
      if (prev.top !== m.top || prev.h !== m.h) {
        lastShellRef.current = { top: m.top, h: m.h };
        root.style.setProperty('--im-shell-top', `${m.top}px`);
        root.style.setProperty('--im-shell-h', `${m.h}px`);
      }
      body.classList.toggle('im-keyboard', m.keyboardUp);
      body.classList.remove('im-keyboard-overlay');
      const insetPx = m.keyboardUp ? m.kbInset : 0;
      root.style.setProperty('--im-shell-kb-inset', `${insetPx}px`);
      if (!isFlutterH5Host() || insetPx > 0) {
        root.style.setProperty('--im-kb-inset', `${insetPx}px`);
      }
      setInset(insetPx);
      writeComposerHeight(measureComposerHeight());
      if (m.keyboardUp) {
        pinDocScroll();
        scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
      }
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isImBottomSheet()) {
          body.classList.remove('im-keyboard', 'im-keyboard-overlay');
          setInset(0);
          return;
        }
        // 未聚焦时刷新 baseline，避免旋屏/分屏后键盘抬升偏高
        if (!focusedRef.current) {
          openBaselineRef.current = Math.round(
            Math.max(window.innerHeight || 0, vv?.height ?? 0),
          );
        }
        applyShell(computeShellMetrics(focusedRef.current, openBaselineRef.current));
      });
    };

    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    const focusKick = () => {
      if (!focusedRef.current) return;
      sync();
      window.setTimeout(sync, 48);
      window.setTimeout(sync, 160);
      window.setTimeout(sync, 320);
    };
    window.addEventListener('focusin', focusKick);

    let hostPoll: ReturnType<typeof setInterval> | null = null;
    if (isFlutterH5Host()) {
      hostPoll = setInterval(() => {
        if (focusedRef.current) sync();
      }, 140);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (hostPoll) clearInterval(hostPoll);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('focusin', focusKick);
      teardownImViewportShell();
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (composerFocused) {
      openBaselineRef.current = Math.round(
        Math.max(
          window.innerHeight || 0,
          window.visualViewport?.height ?? 0,
        ),
      );
    }
    const m = computeShellMetrics(composerFocused, openBaselineRef.current);
    lastShellRef.current = { top: m.top, h: m.h };
    root.style.setProperty('--im-shell-top', `${m.top}px`);
    root.style.setProperty('--im-shell-h', `${m.h}px`);
    writeComposerHeight(measureComposerHeight());

    if (!composerFocused) {
      body.classList.remove('im-keyboard', 'im-keyboard-overlay');
      openBaselineRef.current = Math.round(
        Math.max(
          window.innerHeight || 0,
          window.visualViewport?.height ?? 0,
        ),
      );
      root.style.setProperty('--im-kb-inset', '0px');
      root.style.setProperty('--im-shell-kb-inset', '0px');
      setInset(0);
      return;
    }

    body.classList.toggle('im-keyboard', m.keyboardUp);
    const insetPx = m.keyboardUp ? m.kbInset : 0;
    root.style.setProperty('--im-shell-kb-inset', `${insetPx}px`);
    if (!isFlutterH5Host() || insetPx > 0) {
      root.style.setProperty('--im-kb-inset', `${insetPx}px`);
    }
    pinDocScroll();
    if (m.keyboardUp) {
      scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
    }
    setInset(insetPx);
    const kick = () => {
      const m2 = computeShellMetrics(true, openBaselineRef.current);
      lastShellRef.current = { top: m2.top, h: m2.h };
      root.style.setProperty('--im-shell-h', `${m2.h}px`);
      body.classList.toggle('im-keyboard', m2.keyboardUp);
      scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
    };
    const t1 = window.setTimeout(kick, 60);
    const t2 = window.setTimeout(kick, 200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [composerFocused]);

  return inset;
}

/** @deprecated 保留空实现兼容旧调用 */
export function previewImKeyboardLift() {
  /* no-op */
}
