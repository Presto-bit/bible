'use client';

import type { CSSProperties, ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';

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
  /**
   * 打开后短窗忽略点遮罩关闭（防同按压闪关）。
   * 读经词典 / 概要 / 半屏默认 true。
   */
  openGuardMs?: number | false;
};

/**
 * 标准可关全屏遮罩：点遮罩关闭 + 切 Tab 关闭 + 可选 AppBodyPortal + 开层 guard。
 * 新半屏请优先用此组件，避免 TWA 上「点了没反应 / 闪关」。
 */
export default function DismissibleSheetBackdrop({
  onClose,
  children,
  className,
  style,
  portal = true,
  align = 'end',
  role = 'presentation',
  openGuardMs = SHEET_OPEN_GUARD_MS,
}: Props) {
  const guardMs = openGuardMs === false ? 0 : openGuardMs;
  const { guardedClose } = useSheetOpenGuard(guardMs);

  const handleBackdropClick = () => {
    if (guardMs > 0) guardedClose(onClose);
    else onClose();
  };

  const mergedStyle: CSSProperties | undefined =
    align === 'center'
      ? { alignItems: 'center', ...style }
      : style;

  const body = (
    <div
      className={['sheet-backdrop', className].filter(Boolean).join(' ')}
      data-dismiss-on-tab-nav
      role={role}
      onClick={handleBackdropClick}
      style={mergedStyle}
    >
      {children}
    </div>
  );

  if (!portal) return body;
  return <AppBodyPortal onTabAway={onClose}>{body}</AppBodyPortal>;
}
