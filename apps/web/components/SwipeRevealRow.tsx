'use client';

import { useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  disabled?: boolean;
};

const REVEAL_PX = 72;
const OPEN_THRESHOLD = 36;

export function SwipeRevealRow({
  children,
  onDelete,
  deleteLabel = '删除',
  disabled = false,
}: Props) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -REVEAL_PX));
    else setOffset(0);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    setOffset(offset < -OPEN_THRESHOLD ? -REVEAL_PX : 0);
  };

  return (
    <div className="swipe-reveal-row">
      <button
        type="button"
        className="swipe-reveal-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
          setOffset(0);
        }}
      >
        {deleteLabel}
      </button>
      <div
        className="swipe-reveal-content"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
