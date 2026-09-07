import type { CSSProperties } from 'react';

/** 与 `--peiai-stagger-step` 对齐 */
export const PEIAI_STAGGER_STEP_MS = 48;

/** 错落入场总时长上限（用于关闭 `home-stagger-enter` 容器类） */
export function peiaiStaggerDurationMs(maxIndex: number): number {
  return maxIndex * PEIAI_STAGGER_STEP_MS + 320 + 80;
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

/** 我的页错落：父级需带 `profile-stagger-enter`（可选 JS 驱动；默认 CSS 块级入场） */
export function peiaiProfileStaggerProps(
  index: number,
  enabled: boolean,
): { className?: string; style?: CSSProperties } {
  return peiaiStaggerProps(index, enabled, 'profile-stagger-item');
}
