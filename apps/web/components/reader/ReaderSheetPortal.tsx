'use client';

import type { ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';
import { useSheetDrag } from '@/lib/use_sheet_drag';

/** 阅读器内底部 Sheet：挂 body + 点遮罩关闭 + 顶部下拉关闭（跟手 + spring）。 */
export default function ReaderSheetPortal({
  onClose,
  title,
  backdropClassName = '',
  sheetClassName = 'sheet card',
  children,
}: {
  onClose: () => void;
  /** 顶栏标题；有则显示抓条 + 关闭按钮，正文可滚 */
  title?: ReactNode;
  backdropClassName?: string;
  sheetClassName?: string;
  children: ReactNode;
}) {
  const { guardedClose } = useSheetOpenGuard(SHEET_OPEN_GUARD_MS);
  const drag = useSheetDrag({ onClose, enabled: true });

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className={[
          'sheet-backdrop',
          'reader-sheet-backdrop',
          'peiai-motion-sheet-backdrop',
          drag.dragging ? 'is-sheet-dragging is-dragging' : '',
          backdropClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        style={drag.scrimOpacity != null ? { opacity: drag.scrimOpacity } : undefined}
        onClick={() => guardedClose(onClose)}
        data-dismiss-on-tab-nav
      >
        <div
          className={[
            sheetClassName,
            'peiai-motion-sheet-panel',
            drag.dragging ? 'is-dragging' : '',
            drag.settling ? 'is-settling' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={drag.panelStyle}
          onClick={(e) => e.stopPropagation()}
          {...drag.handlers}
          role="dialog"
          aria-modal="true"
        >
          <div className="half-sheet-grab" aria-hidden />
          {title != null ? (
            <div className="reader-settings-sheet-head" ref={drag.headRef}>
              <div className="reader-settings-sheet-title">{title}</div>
              <SheetCloseButton onClick={onClose} />
            </div>
          ) : (
            <div ref={drag.headRef} hidden aria-hidden />
          )}
          <div className="reader-settings-sheet-body" ref={drag.bodyRef}>
            {children}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
