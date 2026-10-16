'use client';

import {
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { shellTapProps, type ShellTapOpts } from '@/lib/shell_tap';

export type PressableProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave'
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
  /** 按压缩放档：default | icon | card；false 关闭视觉按压 */
  press?: 'default' | 'icon' | 'card' | false;
  children?: ReactNode;
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLButtonElement>) => void;
};

/**
 * TWA / 安卓 WebView 可靠点击原语 + 统一按压反馈。
 * 五 Tab chrome、开 sheet、主 CTA 用这个；勿再裸 onClick 指望合成 click。
 * 减动效由 CSS `prefers-reduced-motion` 降级，勿在此用 JS 分支以免 hydration 不一致。
 */
export function Pressable({
  onTap,
  softRecover = false,
  beforePointerTap,
  preventDefault = false,
  blurOnClick = true,
  phase = 'down',
  press = 'default',
  disabled,
  type = 'button',
  className,
  children,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...rest
}: PressableProps) {
  const [pressed, setPressed] = useState(false);
  const pressVisual = press !== false;

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

  const setPress = (v: boolean) => {
    if (!pressVisual || disabled) return;
    setPressed(v);
  };

  const mergedClass = [
    className,
    press !== false ? 'peiai-pressable' : '',
    pressed ? 'is-pressed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      disabled={disabled}
      className={mergedClass || undefined}
      data-press={press === false ? undefined : press}
      data-pressed={pressed ? '1' : undefined}
      {...rest}
      {...tap}
      onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPress(true);
        tap.onPointerDown?.(e);
        onPointerDown?.(e);
      }}
      onPointerUp={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPress(false);
        tap.onPointerUp?.(e);
        onPointerUp?.(e);
      }}
      onPointerCancel={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPress(false);
        tap.onPointerCancel?.(e);
        onPointerCancel?.(e);
      }}
      onPointerLeave={(e: ReactPointerEvent<HTMLButtonElement>) => {
        setPress(false);
        onPointerLeave?.(e);
      }}
    >
      {children}
    </button>
  );
}

export { shellTapProps } from '@/lib/shell_tap';
