'use client';

import { useEffect, useRef, useState } from 'react';

const LAST_KB_KEY = 'im-kb-last-h';

function pinScrollTop() {
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

function readLastKb(): number {
  try {
    const n = Number(sessionStorage.getItem(LAST_KB_KEY) || '0');
    return Number.isFinite(n) && n > 80 ? Math.round(n) : 0;
  } catch {
    return 0;
  }
}

function writeLastKb(px: number) {
  if (px < 80) return;
  try {
    sessionStorage.setItem(LAST_KB_KEY, String(Math.round(px)));
  } catch {
    /* ignore */
  }
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

/**
 * 键盘遮挡高度（多信号取最大）：
 * - overlays：layout - vv.height - offsetTop
 * - iOS PWA：vv.height 常不变，Safari 用 scrollY / offsetTop 顶起；二者之和作代理
 * - baseline：聚焦前全屏高 - 当前可视底
 *
 * 注意：键盘态不要反复 pinScrollTop，否则会清掉 iOS 的 scroll/offsetTop 信号，
 * 导致 inset 一直为 0、输入栏沉在键盘下。
 */
function measureKeyboardRaw(baselineH: number): number {
  const vv = window.visualViewport;
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const vvH = vv?.height ?? layoutH;
  const vvTop = vv?.offsetTop ?? 0;
  const scrollY =
    window.scrollY
    || document.documentElement.scrollTop
    || document.body.scrollTop
    || 0;

  const layoutHidden = Math.max(0, Math.round(layoutH - vvH - vvTop));
  const scrollProxy = Math.max(0, Math.round(scrollY + vvTop));
  const vvBottom = Math.round(vvTop + vvH);
  const fromBase = Math.max(0, Math.round((baselineH || layoutH) - vvBottom));
  const baseProxy = fromBase > 80 ? fromBase : 0;

  return Math.max(layoutHidden, scrollProxy, baseProxy);
}

export type ImComposerKeyboardOpts = {
  /** 聊天滚动容器（群 .group-checkin-scroll / 私信 .dm-msg-list） */
  getScrollEl?: () => HTMLElement | null;
};

/**
 * IM 键盘贴合（群 / 私信共用）：
 * - 用 --im-kb-inset 抬高会话壳底边，输入栏随文档流贴在键盘上沿
 * - iOS PWA 以 scroll/offsetTop 代理键盘高；本焦点期内 inset 只升不降
 * - 聚焦前可预抬上次键盘高度，减少首帧被挡
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
  /** 本焦点期内见过的最大键盘高（避免 pin/回弹把 inset 打回 0） */
  const maxKbRef = useRef(0);

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
    let pinTimer: number | undefined;

    const clearChrome = () => {
      setInset(0);
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

    const applyChrome = (kb: number) => {
      const next = kb > 24 ? kb : 0;
      setInset(next);
      if (next > 0) {
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', `${next}px`);
        writeLastKb(next);
      } else {
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', '0px');
      }
      // 不再用 vv 锁壳高；统一靠 bottom: var(--im-kb-inset)
      root.style.removeProperty('--im-vv-h');
      root.style.removeProperty('--im-vv-top');
      body.classList.remove('im-keyboard-overlay');
      pinChat();
    };

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!baselineHRef.current) {
          baselineHRef.current = readViewportHeight();
        }
        const raw = measureKeyboardRaw(baselineHRef.current);
        if (raw > maxKbRef.current) maxKbRef.current = raw;
        // 焦点期内保留峰值，防止 iOS 回弹/我们晚一点 pin 后信号变 0
        const held = Math.max(raw, maxKbRef.current);
        applyChrome(held);
      });
    };

    if (!active) {
      maxKbRef.current = 0;
      const isBottomSheet = () =>
        body.classList.contains('im-plus-sheet')
        || body.classList.contains('im-mention-sheet');
      // 加号 / @ 贴底面板：立刻落回屏底，勿沿用键盘 inset 留白
      if (isBottomSheet()) {
        clearChrome();
        pinScrollTop();
      } else {
        let n = 0;
        const kb0 = measureKeyboardRaw(baselineHRef.current || readViewportHeight());
        if (kb0 <= 24) {
          clearChrome();
          pinScrollTop();
        } else {
          applyChrome(kb0);
          poll = window.setInterval(() => {
            n += 1;
            if (isBottomSheet()) {
              if (poll) window.clearInterval(poll);
              poll = undefined;
              clearChrome();
              pinScrollTop();
              return;
            }
            const kb = measureKeyboardRaw(baselineHRef.current || readViewportHeight());
            if (kb <= 24 || n > 28) {
              if (poll) window.clearInterval(poll);
              poll = undefined;
              clearChrome();
              pinScrollTop();
              return;
            }
            applyChrome(kb);
          }, 50);
        }
      }
    } else {
      if (!baselineHRef.current) {
        baselineHRef.current = readViewportHeight();
      }
      maxKbRef.current = 0;
      // 预抬：先用上次稳定键盘高，避免首帧仍沉在键盘下
      const preview = readLastKb();
      if (preview > 80) {
        maxKbRef.current = preview;
        applyChrome(preview);
      }

      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      window.addEventListener('scroll', sync, { passive: true });
      sync();
      for (const ms of [32, 80, 140, 220, 360, 520, 800, 1200, 1600]) {
        followTimers.push(window.setTimeout(sync, ms));
      }
      // 等 vv/scroll 信号采到峰值后再轻量钉住文档滚动，减少整页被顶走
      pinTimer = window.setTimeout(() => {
        pinScrollTop();
        sync();
      }, 420);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (poll) window.clearInterval(poll);
      if (pinTimer) window.clearTimeout(pinTimer);
      for (const t of followTimers) window.clearTimeout(t);
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync);
      clearChrome();
      pinScrollTop();
    };
  }, [active]);

  return inset;
}

/** 在 focus 前预抬（touchstart/mousedown），减少 iOS 先挡后抬 */
export function previewImKeyboardLift() {
  const kb = readLastKb();
  if (kb < 80) return;
  const root = document.documentElement;
  const body = document.body;
  body.classList.add('im-keyboard');
  root.style.setProperty('--im-kb-inset', `${kb}px`);
}

/** 打开加号 / @ 等贴底面板时立刻清掉键盘抬升，避免留下整块空白 */
export function clearImKeyboardLift() {
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove('im-keyboard', 'im-keyboard-overlay');
  root.style.removeProperty('--im-kb-inset');
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  pinScrollTop();
}
