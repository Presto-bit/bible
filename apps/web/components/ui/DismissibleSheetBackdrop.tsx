'use client';

import type { CSSProperties, ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';

type Props = {
  onClose: () => void;
  children: ReactNode;
  /** 附加在 sheet-backdrop 上的 class */
  className?: string;
  style?: CSSProperties;
  /** 默认挂 body portal；嵌套在已有 portal 内时可关 */
  portal?: boolean;
  /** 居中卡片（设密引导等） */
  align?: 'end' | 'center';
  role?: string;
};

/**
 * 标准可关全屏遮罩：点遮罩关闭 + 切 Tab 关闭 + 可选 AppBodyPortal。
 * 新半屏请优先用此组件，避免 TWA 上「点了没反应」。
 */
export default function DismissibleSheetBackdrop({
  onClose,
  children,
  className,
  style,
  portal = true,
  align = 'end',
  role = 'presentation',
}: Props) {
  const mergedStyle: CSSProperties | undefined =
    align === 'center'
      ? { alignItems: 'center', ...style }
      : style;

  const body = (
    <div
      className={['sheet-backdrop', className].filter(Boolean).join(' ')}
      data-dismiss-on-tab-nav
      role={role}
      onClick={onClose}
      style={mergedStyle}
    >
      {children}
    </div>
  );

  if (!portal) return body;
  return <AppBodyPortal onTabAway={onClose}>{body}</AppBodyPortal>;
}
