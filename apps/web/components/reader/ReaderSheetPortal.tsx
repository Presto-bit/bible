'use client';

import { useRef, useState, type ReactNode } from 'react';
import AppBodyPortal from '@/components/AppBodyPortal';
import { SheetCloseButton } from '@/components/PageBackBar';
import { useSheetOpenGuard } from '@/lib/use_sheet_open_guard';
import { SHEET_OPEN_GUARD_MS } from '@/lib/reader_gesture';

const DISMISS_DY = 72;
const DRAG_CAP = 160;

/** 阅读器内底部 Sheet：挂 body + 点遮罩关闭 + 顶部下拉关闭。 */
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
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const headRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const fromHeadRef = useRef(false);
  const draggingDownRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    draggingDownRef.current = false;
    const t = e.target;
    fromHeadRef.current =
      t instanceof Node
      && (headRef.current?.contains(t) === true
        || (t instanceof Element && t.classList.contains('half-sheet-grab')));
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    if (startY == null) return;
    const dy = (e.touches[0]?.clientY ?? startY) - startY;
    const atTop = fromHeadRef.current || (bodyRef.current?.scrollTop ?? 0) <= 0;
    if (dy > 0 && atTop) {
      draggingDownRef.current = true;
      setDragOffset(Math.min(dy, DRAG_CAP));
      // 阻断透传至读经层翻页；勿 preventDefault（React touch 多为 passive）
      e.stopPropagation();
    } else if (draggingDownRef.current) {
      draggingDownRef.current = false;
      setDragOffset(0);
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    fromHeadRef.current = false;
    const dy = startY != null ? (e.changedTouches[0]?.clientY ?? startY) - startY : 0;
    const shouldClose = draggingDownRef.current && dy > DISMISS_DY;
    draggingDownRef.current = false;
    setDragOffset(0);
    if (shouldClose) onClose();
  };

  const onTouchCancel = () => {
    touchStartYRef.current = null;
    fromHeadRef.current = false;
    draggingDownRef.current = false;
    setDragOffset(0);
  };

  return (
    <AppBodyPortal onTabAway={onClose}>
      <div
        className={['sheet-backdrop', 'reader-sheet-backdrop', backdropClassName].filter(Boolean).join(' ')}
        onClick={() => guardedClose(onClose)}
        data-dismiss-on-tab-nav
      >
        <div
          className={sheetClassName}
          style={
            dragOffset > 0
              ? { transform: `translateY(${dragOffset}px)`, transition: 'none' }
              : undefined
          }
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchCancel}
          role="dialog"
          aria-modal="true"
        >
          <div className="half-sheet-grab" aria-hidden />
          {title != null ? (
            <div className="reader-settings-sheet-head" ref={headRef}>
              <div className="reader-settings-sheet-title">{title}</div>
              <SheetCloseButton onClick={onClose} />
            </div>
          ) : null}
          <div className="reader-settings-sheet-body" ref={bodyRef}>
            {children}
          </div>
        </div>
      </div>
    </AppBodyPortal>
  );
}
