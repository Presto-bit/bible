'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * iOS PWA IM 视口策略（根本修复）：
 *
 * 问题：interactive-widget=resizes-content 下，键盘收起后 layout viewport 常卡住偏矮，
 * fixed + bottom:0 的聊天壳只填满「矮 layout」，底部留白；该状态跨进出群聊仍在。
 *
 * 方案：聊天页挂载期间用 visualViewport 驱动壳的 top/height（body.im-vv-shell），
 * 与 layout 是否卡住无关；卸载时摘掉绑定。性能：仅 rAF 合并，不写 html/body height。
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
  root.style.removeProperty('--im-kb-inset');
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
  root.style.removeProperty('--im-kb-inset');
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

/**
 * 群 / 私信挂载期间用 visualViewport 驱动壳尺寸；
 * composerFocused 仅控制 im-keyboard（藏 sticky），不抬 bottom。
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

  // 页面级 vv → 壳（进出页才装卸）
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let raf = 0;

    body.classList.add('im-vv-shell');
    openBaselineRef.current = Math.round(
      Math.max(window.innerHeight || 0, vv?.height ?? 0),
    );

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isImBottomSheet()) {
          body.classList.remove('im-keyboard', 'im-keyboard-overlay');
          setInset(0);
          return;
        }
        const top = Math.max(0, Math.round(vv?.offsetTop ?? 0));
        const h = Math.max(
          120,
          Math.round(vv?.height ?? window.innerHeight ?? 0),
        );
        const prev = lastShellRef.current;
        if (prev.top !== top || prev.h !== h) {
          lastShellRef.current = { top, h };
          root.style.setProperty('--im-shell-top', `${top}px`);
          root.style.setProperty('--im-shell-h', `${h}px`);
        }

        const base = openBaselineRef.current || h;
        const keyboardUp = focusedRef.current && base - h > 40;
        body.classList.toggle('im-keyboard', keyboardUp);
        body.classList.remove('im-keyboard-overlay');
        root.style.setProperty('--im-kb-inset', '0px');
        setInset(0);
        writeComposerHeight(measureComposerHeight());
        if (keyboardUp) {
          scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle: true });
        }
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

  // 焦点变化：触发一次 sync 语义（写壳 + 切换 im-keyboard）
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    const top = Math.max(0, Math.round(vv?.offsetTop ?? 0));
    const h = Math.max(120, Math.round(vv?.height ?? window.innerHeight ?? 0));
    const base = openBaselineRef.current || h;

    root.style.setProperty('--im-shell-top', `${top}px`);
    root.style.setProperty('--im-shell-h', `${h}px`);
    lastShellRef.current = { top, h };
    writeComposerHeight(measureComposerHeight());

    if (!composerFocused) {
      body.classList.remove('im-keyboard', 'im-keyboard-overlay');
      pinDocScroll();
      setInset(0);
      return;
    }

    const keyboardUp = base - h > 40;
    body.classList.toggle('im-keyboard', keyboardUp);
    if (keyboardUp) {
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
