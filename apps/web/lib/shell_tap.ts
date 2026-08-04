'use client';

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { softRecoverShellTouch } from '@/lib/sheet_overlay';

/**
 * 安卓 WebView / TWA：click 常不触发或合成失败。
 * 主动作默认在 pointerdown，click 仅作桌面兜底；同按压 450ms 去重防 toggle 双触发。
 *
 * 新代码优先用 `Pressable`（components/ui/Pressable）；
 * 读经翻页邻域 / 已有复杂 DOM 再用本函数展开 props。
 * 左滑行等需区分轻触与拖动时用 `phase: 'up'`。
 */

const recentTapAt = new WeakMap<EventTarget, number>();
const pointerStartAt = new WeakMap<EventTarget, { x: number; y: number }>();
const DEDUPE_MS = 450;
const UP_MOVE_TOLERANCE_PX = 14;

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
  /**
   * 开半屏/sheet 前卸透明吞点击层（仅 pointer 路径）。
   * 读经层内「词典 / 小爱 / 概要」默认建议 true。
   */
  softRecover?: boolean;
  preventDefault?: boolean;
  /** click 后 blur，消安卓焦点方框 */
  blurOnClick?: boolean;
  /**
   * down（默认）：pointerdown 立刻开火——按钮 / Tab / 开层。
   * up：松手且位移小时开火——左滑行内容区，避免拖动被当成点击。
   */
  phase?: 'down' | 'up';
};

/** 展开为 button / role=button 的 pointer + click 处理器 */
export function shellTapProps(opts: ShellTapOpts) {
  const {
    onTap,
    beforePointerTap,
    softRecover = false,
    preventDefault = false,
    blurOnClick = false,
    phase = 'down',
  } = opts;

  const runPointerTap = (target: EventTarget) => {
    if (softRecover) softRecoverShellTouch();
    beforePointerTap?.();
    markTap(target);
    onTap();
  };

  if (phase === 'up') {
    return {
      onPointerDown(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        pointerStartAt.set(e.currentTarget, { x: e.clientX, y: e.clientY });
      },
      onPointerUp(e: ReactPointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        const start = pointerStartAt.get(e.currentTarget);
        pointerStartAt.delete(e.currentTarget);
        if (!start) return;
        if (
          Math.abs(e.clientX - start.x) > UP_MOVE_TOLERANCE_PX
          || Math.abs(e.clientY - start.y) > UP_MOVE_TOLERANCE_PX
        ) {
          return;
        }
        e.stopPropagation();
        if (preventDefault) e.preventDefault();
        runPointerTap(e.currentTarget);
      },
      onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
        pointerStartAt.delete(e.currentTarget);
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

  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      e.stopPropagation();
      if (e.button !== 0) return;
      if (preventDefault) e.preventDefault();
      runPointerTap(e.currentTarget);
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
