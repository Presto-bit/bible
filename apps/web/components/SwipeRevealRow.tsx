'use client';

import { useRef, useState, type ReactNode } from 'react';
import { isFinePointerUI } from '@/lib/touch_ui';

type Props = {
  children: ReactNode;
  onDelete: () => void;
  onContentClick?: () => void;
  deleteLabel?: string;
  disabled?: boolean;
};

const REVEAL_PX = 72;
const OPEN_THRESHOLD = 36;

export function SwipeRevealRow({
  children,
  onDelete,
  onContentClick,
  deleteLabel = '删除',
  disabled = false,
}: Props) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const finePointer = isFinePointerUI();

  const setOffsetSafe = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || finePointer) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || disabled || finePointer) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffsetSafe(Math.max(dx, -REVEAL_PX));
    else setOffsetSafe(0);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    const cur = offsetRef.current;
    setOffsetSafe(cur < -OPEN_THRESHOLD ? -REVEAL_PX : 0);
  };

  const handleContentClick = () => {
    if (offsetRef.current < -10) {
      setOffsetSafe(0);
      return;
    }
    onContentClick?.();
  };

  return (
    <div className="swipe-reveal-row">
      <button
        type="button"
        className={`swipe-reveal-delete${offset < -4 ? ' is-revealed' : ''}`}
        tabIndex={offset < -4 ? 0 : -1}
        aria-hidden={offset >= -4}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
          setOffsetSafe(0);
        }}
      >
        {deleteLabel}
      </button>
      {finePointer ? (
        <div className="swipe-reveal-desktop-actions">
          <button
            type="button"
            className="swipe-reveal-desktop-btn swipe-reveal-desktop-btn-delete"
            aria-label={deleteLabel}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            {deleteLabel}
          </button>
        </div>
      ) : null}
      <div
        className="swipe-reveal-content"
        style={finePointer ? undefined : { transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
