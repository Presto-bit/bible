'use client';

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

/**
 * 安卓 WebView / TWA：click 常不触发或合成失败。
 * 读经翻页层附近的控件应在 pointerdown 执行主动作，click 仅作桌面兜底。
 * 同一按压周期内去重，避免 toggle 类动作被打开又立刻关掉。
 */

const recentTapAt = new WeakMap<EventTarget, number>();
const DEDUPE_MS = 450;

function markTap(target: EventTarget) {
  recentTapAt.set(target, typeof performance !== 'undefined' ? performance.now() : Date.now());
}

function wasJustTapped(target: EventTarget): boolean {
  const t = recentTapAt.get(target);
  if (t == null) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - t < DEDUPE_MS;
}

export type ShellTapOpts = {
  onTap: () => void;
  /** 仅 pointer 路径（如开半屏前 softRecover）；click 兜底不跑，避免清掉刚挂上的层 */
  beforePointerTap?: () => void;
  preventDefault?: boolean;
  /** click 后 blur，消安卓焦点方框 */
  blurOnClick?: boolean;
};

/** 展开为 button / role=button 的 onPointerDown + onClick */
export function shellTapProps(opts: ShellTapOpts) {
  const { onTap, beforePointerTap, preventDefault = false, blurOnClick = false } = opts;

  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      e.stopPropagation();
      if (e.button !== 0) return;
      if (preventDefault) e.preventDefault();
      beforePointerTap?.();
      markTap(e.currentTarget);
      onTap();
    },
    onClick(e: ReactMouseEvent<HTMLElement>) {
      e.stopPropagation();
      if (preventDefault) e.preventDefault();
      if (blurOnClick && e.currentTarget instanceof HTMLElement) {
        e.currentTarget.blur();
      }
      if (wasJustTapped(e.currentTarget)) return;
      onTap();
    },
  };
}
