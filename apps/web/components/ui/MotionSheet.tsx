'use client';

import type { CSSProperties, ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';
import { useSheetDrag } from '@/lib/use_sheet_drag';

type Props = {
  onClose: () => void;
  children: ReactNode;
  /** 附加在 backdrop 上的 class */
  className?: string;
  /** 面板额外 class（默认 sheet card） */
  panelClassName?: string;
  style?: CSSProperties;
  portal?: boolean;
  align?: 'end' | 'center';
  role?: string;
  openGuardMs?: number | false;
  /** 顶栏标题区（可选）；有则显示抓条 */
  title?: ReactNode;
  /** 底部半屏默认允许下拖关闭；居中卡片默认关 */
  dragToDismiss?: boolean;
  /** 是否显示顶部抓条 */
  showGrab?: boolean;
};

/**
 * 统一半屏 / 居中卡片：开层动画 +（底部）跟手下拖关闭 + Tab 离开关闭。
 * 新半屏优先用此组件；读经内仍可用 ReaderSheetPortal（同套拖拽语义）。
 */
export default function MotionSheet({
  onClose,
  children,
  className,
  panelClassName = 'sheet card',
  style,
  portal = true,
  align = 'end',
  role = 'presentation',
  openGuardMs = SHEET_OPEN_GUARD_MS,
  title,
  dragToDismiss = align === 'end',
  showGrab = align === 'end',
}: Props) {
  const guardMs = openGuardMs === false ? 0 : openGuardMs;
  const { guardedClose } = useSheetOpenGuard(guardMs);
  const drag = useSheetDrag({ onClose, enabled: dragToDismiss });

  const handleBackdropClick = () => {
    if (guardMs > 0) guardedClose(onClose);
    else onClose();
  };

  const backdropStyle: CSSProperties = {
    ...(align === 'center' ? { alignItems: 'center' } : null),
    ...(drag.scrimOpacity != null ? { opacity: drag.scrimOpacity } : null),
    ...style,
  };

  const panelClass = [
    panelClassName,
    'peiai-motion-sheet-panel',
    drag.dragging ? 'is-dragging' : '',
    drag.settling ? 'is-settling' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <div
      className={[
        'sheet-backdrop',
        'peiai-motion-sheet-backdrop',
        drag.dragging ? 'is-dragging' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-dismiss-on-tab-nav
      data-align={align}
      role={role}
      onClick={handleBackdropClick}
      style={backdropStyle}
    >
      <div
        className={panelClass}
        style={drag.panelStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        {...(dragToDismiss ? drag.handlers : {})}
      >
        {showGrab ? <div className="half-sheet-grab" aria-hidden /> : null}
        {title != null ? (
          <div className="reader-settings-sheet-head" ref={drag.headRef}>
            <div className="reader-settings-sheet-title">{title}</div>
          </div>
        ) : (
          <div ref={drag.headRef} hidden aria-hidden />
        )}
        <div
          className={title != null ? 'reader-settings-sheet-body' : undefined}
          ref={drag.bodyRef}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (!portal) return body;
  return <AppBodyPortal onTabAway={onClose}>{body}</AppBodyPortal>;
}
