'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { shellTapProps, type ShellTapOpts } from '@/lib/shell_tap';

export type PressableProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerCancel'
> & {
  /** 主动作：安卓 WebView 走 pointer，桌面 click 兜底 */
  onTap: () => void;
  /** 开半屏前卸透明吞点击层（仅 pointer 路径） */
  softRecover?: boolean;
  beforePointerTap?: ShellTapOpts['beforePointerTap'];
  preventDefault?: boolean;
  /** 默认 true：消安卓焦点方框 */
  blurOnClick?: boolean;
  /** 默认 down；左滑行内容用 up */
  phase?: ShellTapOpts['phase'];
  children?: ReactNode;
};

/**
 * TWA / 安卓 WebView 可靠点击原语。
 * 五 Tab chrome、开 sheet、主 CTA 用这个；勿再裸 onClick 指望合成 click。
 * 已有复杂手势的控件可改用 `shellTapProps` 展开到现有元素。
 */
export function Pressable({
  onTap,
  softRecover = false,
  beforePointerTap,
  preventDefault = false,
  blurOnClick = true,
  phase = 'down',
  disabled,
  type = 'button',
  children,
  ...rest
}: PressableProps) {
  const tap = shellTapProps({
    onTap: () => {
      if (disabled) return;
      onTap();
    },
    softRecover,
    beforePointerTap,
    preventDefault,
    blurOnClick,
    phase,
  });

  return (
    <button type={type} disabled={disabled} {...rest} {...tap}>
      {children}
    </button>
  );
}

export { shellTapProps } from '@/lib/shell_tap';
