'use client';

import { useEffect, useRef, useState } from 'react';

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
  root.style.removeProperty('height');
  body.style.removeProperty('height');
  pinDocScroll();
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

type ShellMetrics = { top: number; h: number; keyboardUp: boolean };

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

  const layoutShrunk = base - layoutH > 40;
  const vvOccluded = base - (vvH + vvTop) > 40 || base - vvH > 40;
  const keyboardUp = Boolean(focused && (layoutShrunk || vvOccluded));

  if (!keyboardUp) {
    // 未开键盘：优先用 layout；若 layout 异常偏矮则跟 vv
    if (layoutH > 0 && (base - layoutH < 80 || !vv)) {
      return { top: 0, h: layoutH, keyboardUp: false };
    }
    return { top: 0, h: Math.max(120, vvH), keyboardUp: false };
  }

  if (layoutShrunk) {
    // layout 已正确收缩：不要再跟 offsetTop / 二次缩小
    return { top: 0, h: Math.max(120, layoutH), keyboardUp: true };
  }

  // layout 卡住：仅用可视高度，强制 top=0 + 锁滚动，避免 offsetTop 把整壳顶飞
  return { top: 0, h: Math.max(120, vvH), keyboardUp: true };
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
      // Flutter 壳已注入 --im-kb-inset / android-flutter-kb；勿清零以免输入栏与键盘脱节
      if (!isFlutterH5Host()) {
        root.style.setProperty('--im-kb-inset', '0px');
        setInset(0);
      }
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

    sync();
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    const t = window.setTimeout(sync, 120);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      teardownImViewportShell();
    };
  }, []);

  useEffect(() => {
    const m = computeShellMetrics(composerFocused, openBaselineRef.current);
    const root = document.documentElement;
    const body = document.body;
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
      pinDocScroll();
      setInset(0);
      return;
    }

    body.classList.toggle('im-keyboard', m.keyboardUp);
    pinDocScroll();
    if (m.keyboardUp) {
      scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
    }
    setInset(0);
  }, [composerFocused]);

  return inset;
}

/** @deprecated 保留空实现兼容旧调用 */
export function previewImKeyboardLift() {
  /* no-op */
}
