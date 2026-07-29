'use client';

import { useEffect, useRef, useState } from 'react';

const LAST_KB_KEY = 'im-kb-last-h';

function pinScrollTop() {
  // 输入聚焦时绝不能 scrollTo：iOS 会立刻收起键盘
  if (isComposerFieldFocused()) return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  const app = document.querySelector('.app-body');
  if (app instanceof HTMLElement) app.scrollTop = 0;
}

/** 同一容器短时多次滚底合并，避免 RAF/timer 风暴 */
const scrollBottomLastAt = new WeakMap<HTMLElement, number>();

/**
 * 滚到会话底：只改滚动容器 scrollTop，避免 scrollIntoView
 * 在 iOS 上连带顶起 visualViewport / 把输入框顶到键盘下。
 */
export function scrollImChatToBottom(el: HTMLElement | null | undefined) {
  if (!el) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = scrollBottomLastAt.get(el) ?? 0;
  if (now - last < 64) return;
  scrollBottomLastAt.set(el, now);
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

function writeLastKb(px: number) {
  if (px < 80) return;
  try {
    sessionStorage.setItem(LAST_KB_KEY, String(Math.round(px)));
  } catch {
    /* ignore */
  }
}

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

type KbMeasure = {
  /** 需要叠到壳 bottom 上的额外抬升；resizes-content 下必须为 0 */
  inset: number;
  /** layout 未缩、vv 变矮（overlays） */
  overlay: boolean;
};

/**
 * 测量键盘避让：
 * - resizes-content（本站 viewport 默认）：layout 已缩小，壳 bottom:0 即可，inset 必须 0
 *   （若再叠上次键盘高度会把壳顶没 → 白屏）
 * - overlays / 部分 iOS PWA：layout 仍全屏，才用 gap / scroll 代理抬壳
 */
function measureImKeyboard(baselineH: number): KbMeasure {
  const vv = window.visualViewport;
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const vvH = vv?.height ?? layoutH;
  const vvTop = vv?.offsetTop ?? 0;
  const gap = Math.max(0, Math.round(layoutH - vvH - vvTop));
  const base = baselineH || layoutH;
  const layoutShrunk = base - layoutH > 40;

  // layout 已随键盘收缩：切勿再叠 inset
  if (layoutShrunk) {
    return { inset: 0, overlay: false };
  }

  // overlays：layout 与 vv 有明显缝
  if (gap > 24) {
    const cap = Math.max(120, Math.round(layoutH * 0.5));
    return { inset: Math.min(gap, cap), overlay: true };
  }

  // iOS 偶发：layout 未缩，靠 scroll/offsetTop 顶起
  const scrollY =
    window.scrollY
    || document.documentElement.scrollTop
    || document.body.scrollTop
    || 0;
  const scrollProxy = Math.max(0, Math.round(scrollY + vvTop));
  if (scrollProxy > 80) {
    const cap = Math.max(120, Math.round(layoutH * 0.5));
    return { inset: Math.min(scrollProxy, cap), overlay: true };
  }

  return { inset: 0, overlay: false };
}

export type ImComposerKeyboardOpts = {
  /** 聊天滚动容器（群 .group-checkin-scroll / 私信 .dm-msg-list） */
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合（群 / 私信共用）：
 * - resizes-content：只打 im-keyboard（藏底栏），壳贴已缩小的 layout（inset=0）
 * - overlays：用 --im-kb-inset 抬壳底
 * - 聚焦时禁止 window.scrollTo，避免 iOS 键盘闪退
 * - 禁止用「上次键盘高」预抬：会与 resizes-content 叠加成白屏
 */
export function useImComposerKeyboard(
  active: boolean,
  opts?: ImComposerKeyboardOpts,
) {
  const [inset, setInset] = useState(0);
  const getScrollElRef = useRef(opts?.getScrollEl);
  getScrollElRef.current = opts?.getScrollEl;
  /** 键盘未开时的可视高度；聚焦后冻结 */
  const baselineHRef = useRef(0);
  /** overlays 焦点期内见过的最大抬升 */
  const maxKbRef = useRef(0);
  const wasActiveRef = useRef(false);
  const appliedKbRef = useRef(0);

  // 失焦时持续刷新 baseline
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
      appliedKbRef.current = 0;
      body.classList.remove('im-keyboard', 'im-keyboard-overlay');
      root.style.removeProperty('--im-kb-inset');
      root.style.removeProperty('--im-vv-top');
      root.style.removeProperty('--im-vv-h');
    };

    const applyComposerH = () => {
      root.style.setProperty('--im-composer-h', `${measureComposerHeight()}px`);
    };

    const pinChat = () => {
      applyComposerH();
      scrollImChatToBottom(getScrollElRef.current?.() ?? null);
    };

    const applyChrome = (kb: number, overlay: boolean, opts?: { scrollChat?: boolean }) => {
      if (isImBottomSheet()) {
        clearChrome();
        return;
      }
      const next = kb > 24 ? kb : 0;
      const changed = next !== appliedKbRef.current;
      appliedKbRef.current = next;
      setInset(next);
      body.classList.add('im-keyboard');
      body.classList.toggle('im-keyboard-overlay', overlay && next > 0);
      root.style.setProperty('--im-kb-inset', `${next}px`);
      if (next > 0 && overlay) writeLastKb(next);
      root.style.removeProperty('--im-vv-h');
      root.style.removeProperty('--im-vv-top');
      if (opts?.scrollChat !== false && changed) pinChat();
      else applyComposerH();
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isImBottomSheet()) {
          clearChrome();
          return;
        }
        if (!baselineHRef.current) {
          baselineHRef.current = readViewportHeight();
        }
        const { inset: raw, overlay } = measureImKeyboard(baselineHRef.current);
        if (overlay && raw > maxKbRef.current) maxKbRef.current = raw;
        // resizes-content：raw 恒为 0，不要用陈旧 max/预抬把壳顶没
        const held = overlay ? Math.max(raw, maxKbRef.current) : 0;
        applyChrome(held, overlay);
      });
    };

    if (!active) {
      maxKbRef.current = 0;
      const leavingFocus = wasActiveRef.current;
      wasActiveRef.current = false;

      if (!leavingFocus || isImBottomSheet()) {
        clearChrome();
        pinScrollTop();
      } else {
        let n = 0;
        const first = measureImKeyboard(baselineHRef.current || readViewportHeight());
        if (first.inset <= 24) {
          clearChrome();
          pinScrollTop();
        } else {
          applyChrome(first.inset, first.overlay, { scrollChat: false });
          poll = window.setInterval(() => {
            n += 1;
            if (isImBottomSheet() || isComposerFieldFocused()) {
              if (poll) window.clearInterval(poll);
              poll = undefined;
              if (isComposerFieldFocused()) return;
              clearChrome();
              pinScrollTop();
              return;
            }
            const m = measureImKeyboard(baselineHRef.current || readViewportHeight());
            if (m.inset <= 24 || n > 20) {
              if (poll) window.clearInterval(poll);
              poll = undefined;
              clearChrome();
              pinScrollTop();
              return;
            }
            applyChrome(m.inset, m.overlay, { scrollChat: false });
          }, 50);
        }
      }
    } else {
      wasActiveRef.current = true;
      if (!baselineHRef.current) {
        baselineHRef.current = readViewportHeight();
      }
      maxKbRef.current = 0;
      // 只藏底栏，不预抬 inset（避免与 resizes-content 叠加白屏）
      body.classList.add('im-keyboard');
      root.style.setProperty('--im-kb-inset', '0px');

      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      sync();
      for (const ms of [32, 80, 140, 220, 360, 520, 800, 1200, 1600]) {
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
      // 离开未聚焦 effect（即将聚焦）时不要 clear+scrollTo
      if (active) {
        clearChrome();
        pinScrollTop();
      }
    };
  }, [active]);

  return inset;
}

let previewClearTimer: number | undefined;

/**
 * focus 前轻量准备：只打键盘态 class，不预抬高度。
 * 本站 interactiveWidget=resizes-content，预抬会与 layout 收缩叠加成白屏。
 */
export function previewImKeyboardLift() {
  if (isImBottomSheet()) return;
  const body = document.body;
  const root = document.documentElement;
  body.classList.add('im-keyboard');
  root.style.setProperty('--im-kb-inset', '0px');
  if (previewClearTimer) window.clearTimeout(previewClearTimer);
  previewClearTimer = window.setTimeout(() => {
    previewClearTimer = undefined;
    if (isImBottomSheet() || isComposerFieldFocused()) return;
    clearImKeyboardLift();
  }, 700);
}

/** 打开加号 / @ 等贴底面板时立刻清掉键盘抬升，避免留下整块空白 */
export function clearImKeyboardLift() {
  if (previewClearTimer) {
    window.clearTimeout(previewClearTimer);
    previewClearTimer = undefined;
  }
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove('im-keyboard', 'im-keyboard-overlay');
  root.style.removeProperty('--im-kb-inset');
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  if (!isComposerFieldFocused()) pinScrollTop();
}
