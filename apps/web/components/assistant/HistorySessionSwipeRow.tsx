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

function RenameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** 历史会话左滑露出「改名 / 删除」图标 */
export function HistorySessionSwipeRow({ children, onRename, onDelete, onOpen }: Props) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const dragging = useRef(false);
  const revealed = offset < -4;

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
      <div className="swipe-reveal-actions" aria-hidden={!revealed}>
        <button
          type="button"
          className={`swipe-reveal-rename${revealed ? ' is-revealed' : ''}`}
          aria-label="改名"
          tabIndex={revealed ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            setOffsetSafe(0);
            onRename();
          }}
        >
          <RenameIcon />
        </button>
        <button
          type="button"
          className={`swipe-reveal-delete swipe-reveal-delete-icon${revealed ? ' is-revealed' : ''}`}
          aria-label="删除"
          tabIndex={revealed ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            setOffsetSafe(0);
            onDelete();
          }}
        >
          <DeleteIcon />
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
