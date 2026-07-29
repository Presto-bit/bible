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

/**
 * 收起阶段：不信 scrollProxy（文档残留 scroll / Safari chrome 易误报），
 * 只看 vv 真正变矮或相对 baseline 的遮挡。
 */
function measureKeyboardDismiss(baselineH: number): number {
  const vv = window.visualViewport;
  const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
  const vvH = vv?.height ?? layoutH;
  const vvTop = vv?.offsetTop ?? 0;
  const layoutHidden = Math.max(0, Math.round(layoutH - vvH - vvTop));
  const vvBottom = Math.round(vvTop + vvH);
  const fromBase = Math.max(0, Math.round((baselineH || layoutH) - vvBottom));
  const baseProxy = fromBase > 80 ? fromBase : 0;
  return Math.max(layoutHidden, baseProxy);
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
 * - 未聚焦 / 进页时绝不因误测抬壳（否则底部大块空白）
 * - 聚焦切换时禁止 window.scrollTo，否则 iOS 键盘弹不出 / 闪退
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
  /** 是否曾聚焦过：仅此时失焦才走「跟随收起」；挂载未聚焦直接贴底 */
  const wasActiveRef = useRef(false);
  /** 上一帧已应用的 inset，避免无变化时反复 pinChat 扰动布局 */
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

    const applyChrome = (kb: number, opts?: { scrollChat?: boolean }) => {
      if (isImBottomSheet()) {
        clearChrome();
        return;
      }
      const next = kb > 24 ? kb : 0;
      const changed = next !== appliedKbRef.current;
      appliedKbRef.current = next;
      setInset(next);
      if (next > 0) {
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', `${next}px`);
        writeLastKb(next);
      } else {
        // 聚焦但尚无键盘高度：只藏底栏，不抬壳
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', '0px');
      }
      root.style.removeProperty('--im-vv-h');
      root.style.removeProperty('--im-vv-top');
      body.classList.remove('im-keyboard-overlay');
      // 仅高度变化时滚会话，避免连续 sync 搅动滚动/焦点
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
        const raw = measureKeyboardRaw(baselineHRef.current);
        if (raw > maxKbRef.current) maxKbRef.current = raw;
        // 焦点期内保留峰值（含预抬），防止 iOS 首帧 raw=0 把壳打回底导致键盘闪退
        const held = Math.max(raw, maxKbRef.current);
        applyChrome(held);
      });
    };

    if (!active) {
      maxKbRef.current = 0;
      const leavingFocus = wasActiveRef.current;
      wasActiveRef.current = false;

      // 进页 / 从未聚焦 / 加号@面板：立刻贴底，禁止用误测抬壳
      if (!leavingFocus || isImBottomSheet()) {
        clearChrome();
        pinScrollTop();
      } else {
        // 刚失焦：跟随收起；不用 scrollProxy，避免假抬升
        let n = 0;
        const kb0 = measureKeyboardDismiss(baselineHRef.current || readViewportHeight());
        if (kb0 <= 24) {
          clearChrome();
          pinScrollTop();
        } else {
          applyChrome(kb0, { scrollChat: false });
          poll = window.setInterval(() => {
            n += 1;
            if (isImBottomSheet() || isComposerFieldFocused()) {
              if (poll) window.clearInterval(poll);
              poll = undefined;
              // 若又聚焦了，交给 active 分支，勿清/勿 pin
              if (isComposerFieldFocused()) return;
              clearChrome();
              pinScrollTop();
              return;
            }
            const kb = measureKeyboardDismiss(baselineHRef.current || readViewportHeight());
            if (kb <= 24 || n > 20) {
              if (poll) window.clearInterval(poll);
              poll = undefined;
              clearChrome();
              pinScrollTop();
              return;
            }
            applyChrome(kb, { scrollChat: false });
          }, 50);
        }
      }
    } else {
      wasActiveRef.current = true;
      if (!baselineHRef.current) {
        baselineHRef.current = readViewportHeight();
      }
      maxKbRef.current = 0;

      // 预抬：焦点期内一直可作为下限，直到采到真实高度或失焦
      // （勿在 raw=0 时清掉，否则 iOS 键盘刚弹就会闪退）
      const preview = readLastKb();
      if (preview > 80 && !isImBottomSheet()) {
        maxKbRef.current = preview;
        applyChrome(preview);
      } else {
        body.classList.add('im-keyboard');
        root.style.setProperty('--im-kb-inset', '0px');
      }

      vv?.addEventListener('resize', sync);
      vv?.addEventListener('scroll', sync);
      window.addEventListener('resize', sync);
      // 焦点期不听 window scroll：处理函数里也不 pin 文档
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
      // 关键：离开「未聚焦」effect（即将聚焦）时不要 clear + scrollTo，
      // 否则 iOS 键盘刚唤起就被打断。
      if (active) {
        clearChrome();
        pinScrollTop();
      }
    };
  }, [active]);

  return inset;
}

let previewClearTimer: number | undefined;

/** 在 focus 前预抬（touchstart/mousedown），减少 iOS 先挡后抬 */
export function previewImKeyboardLift() {
  if (isImBottomSheet()) return;
  const kb = readLastKb();
  if (kb < 80) return;
  const root = document.documentElement;
  const body = document.body;
  body.classList.add('im-keyboard');
  root.style.setProperty('--im-kb-inset', `${kb}px`);
  if (previewClearTimer) window.clearTimeout(previewClearTimer);
  // 未真正聚焦则收回抬升；聚焦时绝不 pinScrollTop
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
  // 聚焦中清抬升也别 scrollTo，否则键盘闪退
  if (isComposerFieldFocused()) {
    const root = document.documentElement;
    const body = document.body;
    body.classList.remove('im-keyboard', 'im-keyboard-overlay');
    root.style.removeProperty('--im-kb-inset');
    root.style.removeProperty('--im-vv-top');
    root.style.removeProperty('--im-vv-h');
    return;
  }
  const root = document.documentElement;
  const body = document.body;
  body.classList.remove('im-keyboard', 'im-keyboard-overlay');
  root.style.removeProperty('--im-kb-inset');
  root.style.removeProperty('--im-vv-top');
  root.style.removeProperty('--im-vv-h');
  pinScrollTop();
}
