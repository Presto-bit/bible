import type { CSSProperties } from 'react';

/** 与 `--peiai-stagger-step` 对齐 */
export const PEIAI_STAGGER_STEP_MS = 48;

export const PEIAI_MOTION_MS = {
  fast: 140,
  normal: 220,
  enter: 320,
  spring: 420,
  tabFade: 160,
} as const;

/** 错落入场总时长上限（用于关闭 stagger 容器类） */
export function peiaiStaggerDurationMs(maxIndex: number): number {
  return maxIndex * PEIAI_STAGGER_STEP_MS + PEIAI_MOTION_MS.enter + 80;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 首页区块错落：父级需带 `home-stagger-enter` */
export function peiaiStaggerProps(
  index: number,
  enabled: boolean,
  itemClass = 'home-stagger-item',
): { className?: string; style?: CSSProperties } {
  if (!enabled || index < 0) return {};
  return {
    className: itemClass,
    style: { '--stagger-i': index } as CSSProperties,
  };
}

/** 我的页错落：父级需带 `profile-stagger-enter` */
export function peiaiProfileStaggerProps(
  index: number,
  enabled: boolean,
): { className?: string; style?: CSSProperties } {
  return peiaiStaggerProps(index, enabled, 'profile-stagger-item');
}

/** 发现会话列表：父级 `discover-stagger-enter` */
export function peiaiDiscoverStaggerProps(
  index: number,
  enabled: boolean,
): { className?: string; style?: CSSProperties } {
  return peiaiStaggerProps(index, enabled, 'discover-stagger-item');
}

/** 轻触觉（仅 Android WebView / 支持 vibrate 的环境；失败静默） */
export function peiaiHapticLight(): void {
  if (typeof navigator === 'undefined') return;
  try {
    navigator.vibrate?.(10);
  } catch {
    /* ignore */
  }
}

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
};

/**
 * 在支持时包一层 View Transition；不支持或减动效则同步执行。
 * 用于二级路由 push（router 更新在 callback 内）。
 */
export function runWithViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    update();
    return;
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionLike;
  };
  if (typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  try {
    doc.startViewTransition(() => {
      update();
    });
  } catch {
    update();
  }
}

/** 给元素打一次 `peiai-feedback-pop` class */
export function peiaiTriggerFeedbackPop(el: Element | null | undefined): void {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove('peiai-feedback-pop');
  // 强制 reflow 以便重播
  void (el as HTMLElement).offsetWidth;
  el.classList.add('peiai-feedback-pop');
  window.setTimeout(() => el.classList.remove('peiai-feedback-pop'), PEIAI_MOTION_MS.spring);
}
