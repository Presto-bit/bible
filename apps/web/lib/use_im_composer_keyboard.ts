'use client';

import { useEffect, useRef, useState } from 'react';

const LAST_KB_KEY = 'im-kb-last-h';

function pinScrollTop(force = false) {
  // 输入聚焦时绝不能 scrollTo：iOS 会立刻收起键盘
  if (!force && isComposerFieldFocused()) return;
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
  /** layout 已随键盘收缩（resizes-content） */
  layoutShrunk: boolean;
};

/**
 * 测量键盘避让：
 * - resizes-content（本站 viewport 默认）：layout 已缩小，壳 bottom:0 即可，inset 必须 0
 * - overlays：仅用 layout↔vv 的 gap；不用 scrollProxy（收起后易残留误抬）
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
    return { inset: 0, overlay: false, layoutShrunk: true };
  }

  // overlays：layout 与 vv 有明显缝（要求 vvTop 也佐证，减少误报）
  if (gap > 48 && (vvTop > 0 || gap > 120)) {
    const cap = Math.max(120, Math.round(layoutH * 0.45));
    return { inset: Math.min(gap, cap), overlay: true, layoutShrunk: false };
  }

  return { inset: 0, overlay: false, layoutShrunk: false };
}

export type ImComposerKeyboardOpts = {
  /** 聊天滚动容器（群 .group-checkin-scroll / 私信 .dm-msg-list） */
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合（群 / 私信共用）：
 * - 等键盘真正出现再打 im-keyboard
 * - resizes-content：inset=0；overlays：仅 gap 抬壳
 * - 失焦 / 键盘收起：立刻清抬升并钉文档，禁止用残留 scroll 再抬（否则底栏悬空）
 */
export function useImComposerKeyboard(
  active: boolean,
  opts?: ImComposerKeyboardOpts,
) {
  const [inset, setInset] = useState(0);
  const getScrollElRef = useRef(opts?.getScrollEl);
  getScrollElRef.current = opts?.getScrollEl;
  const baselineHRef = useRef(0);
  const maxKbRef = useRef(0);
  const wasActiveRef = useRef(false);
  const appliedKbRef = useRef(0);
  const keyboardOpenRef = useRef(false);
  /** 本焦点期见过 layout 收缩 → 之后只用 resize 路径，忽略 overlays 误测 */
  const resizeModeRef = useRef(false);

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
    const settleTimers: number[] = [];
    const followTimers: number[] = [];

    const clearChrome = () => {
      setInset(0);
      appliedKbRef.current = 0;
      keyboardOpenRef.current = false;
      body.classList.remove('im-keyboard', 'im-keyboard-overlay');
      root.style.removeProperty('--im-kb-inset');
      root.style.removeProperty('--im-vv-top');
      root.style.removeProperty('--im-vv-h');
    };

    /** 收起后强制落回屏底（可 force pin，避免焦点竞态拦掉 scrollTo） */
    const settleDismiss = (forcePin = true) => {
      maxKbRef.current = 0;
      resizeModeRef.current = false;
      clearChrome();
      pinScrollTop(forcePin);
    };

    const applyComposerH = () => {
      root.style.setProperty('--im-composer-h', `${measureComposerHeight()}px`);
    };

    const pinChat = (gentle?: boolean) => {
      applyComposerH();
      scrollImChatToBottom(getScrollElRef.current?.() ?? null, { gentle });
    };

    const applyChrome = (
      kb: number,
      overlay: boolean,
      keyboardUp: boolean,
      opts?: { scrollChat?: boolean },
    ) => {
      if (isImBottomSheet()) {
        clearChrome();
        return;
      }

      if (!keyboardUp) {
        if (keyboardOpenRef.current) clearChrome();
        else applyComposerH();
        return;
      }

      const next = kb > 24 ? kb : 0;
      if (
        overlay
        && keyboardOpenRef.current
        && Math.abs(next - appliedKbRef.current) < 12
      ) {
        return;
      }

      const wasOpen = keyboardOpenRef.current;
      const changed = next !== appliedKbRef.current || !wasOpen;
      appliedKbRef.current = next;
      keyboardOpenRef.current = true;
      setInset(next);
      body.classList.add('im-keyboard');
      body.classList.toggle('im-keyboard-overlay', overlay && next > 0);
      root.style.setProperty('--im-kb-inset', `${next}px`);
      if (next > 0 && overlay) writeLastKb(next);
      root.style.removeProperty('--im-vv-h');
      root.style.removeProperty('--im-vv-top');
      if (opts?.scrollChat !== false && changed) pinChat(true);
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
        const m = measureImKeyboard(baselineHRef.current);
        if (m.layoutShrunk) resizeModeRef.current = true;

        // 本焦点期已确认 resizes-content：键盘在 → inset 0；键盘收起（仍聚焦）→ 立刻清
        if (resizeModeRef.current) {
          if (m.layoutShrunk) {
            applyChrome(0, false, true);
          } else if (keyboardOpenRef.current) {
            clearChrome();
          } else {
            applyComposerH();
          }
          return;
        }

        if (m.overlay && m.inset > maxKbRef.current) maxKbRef.current = m.inset;
        const held = m.overlay ? Math.max(m.inset, maxKbRef.current) : 0;
        const keyboardUp = m.overlay && held > 24;
        if (!keyboardUp && keyboardOpenRef.current) {
          clearChrome();
          return;
        }
        applyChrome(held, m.overlay, keyboardUp);
      });
    };

    if (!active) {
      wasActiveRef.current = false;
      // 失焦：立刻清抬升。绝不再用 dismiss 轮询去 applyChrome（scroll/gap 残留会把底栏顶住）
      settleDismiss(true);
      for (const ms of [80, 200, 400]) {
        settleTimers.push(
          window.setTimeout(() => {
            if (isComposerFieldFocused()) return;
            settleDismiss(true);
          }, ms),
        );
      }
    } else {
      wasActiveRef.current = true;
      if (!baselineHRef.current) {
        baselineHRef.current = readViewportHeight();
      }
      maxKbRef.current = 0;
      keyboardOpenRef.current = false;
      resizeModeRef.current = false;

      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      sync();
      for (const ms of [80, 200, 400, 700]) {
        followTimers.push(window.setTimeout(sync, ms));
      }
    }

    return () => {
      cancelAnimationFrame(raf);
      for (const t of settleTimers) window.clearTimeout(t);
      for (const t of followTimers) window.clearTimeout(t);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      if (active) {
        // 离开聚焦：强制清 + pin，避免残留 inset 顶着输入栏和 tab
        settleDismiss(true);
      }
    };
  }, [active]);

  return inset;
}

/**
 * 保留 API：resizes-content 下预抬会叠出白屏/跳动，这里刻意空操作。
 */
export function previewImKeyboardLift() {
  /* no-op */
}

/** 打开加号 / @ 等贴底面板时立刻清掉键盘抬升，避免留下整块空白 */
export function clearImKeyboardLift() {
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove('im-keyboard', 'im-keyboard-overlay');
  root.style.removeProperty('--im-kb-inset');
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  pinScrollTop(true);
}
