'use client';

import { useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onRename: () => void;
  onDelete: () => void;
  onOpen: () => void;
};

const REVEAL_PX = 136;
const OPEN_THRESHOLD = 40;

/** 历史会话左滑露出「改名 / 删除」 */
export function HistorySessionSwipeRow({ children, onRename, onDelete, onOpen }: Props) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const dragging = useRef(false);

  const setOffsetSafe = (next: number) => {
    offsetRef.current = next;
    setOffset(next);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
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
    onOpen();
  };

  return (
    <div className="history-swipe-row swipe-reveal-row">
      <div className="swipe-reveal-actions" aria-hidden={offset === 0}>
        <button
          type="button"
          className="swipe-reveal-rename"
          onClick={(e) => {
            e.stopPropagation();
            setOffsetSafe(0);
            onRename();
          }}
        >
          改名
        </button>
        <button
          type="button"
          className="swipe-reveal-delete"
          onClick={(e) => {
            e.stopPropagation();
            setOffsetSafe(0);
            onDelete();
          }}
        >
          删除
        </button>
      </div>
      <div
        className="swipe-reveal-content history-swipe-content"
        style={{ transform: `translateX(${offset}px)` }}
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
