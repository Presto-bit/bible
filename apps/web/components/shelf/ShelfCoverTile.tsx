'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { loadShelfProgress, shelfCoverHue, type ShelfBookSummary } from '@/lib/shelf_api';

type Props = {
  book: ShelfBookSummary;
  onManage?: (book: ShelfBookSummary) => void;
};

export default function ShelfCoverTile({ book, onManage }: Props) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startXY = useRef<{ x: number; y: number } | null>(null);

  const progress = loadShelfProgress(book.id);
  const href = progress
    ? `/shelf/${book.id}?section=${encodeURIComponent(progress)}`
    : `/shelf/${book.id}`;
  const hue = shelfCoverHue(book.title);

  const clearTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onManage || e.pointerType === 'mouse' && e.button !== 0) return;
    longPressFired.current = false;
    clearTimer();
    startXY.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      try {
        navigator.vibrate?.(10);
      } catch {
        /* ignore */
      }
      onManage?.(book);
    }, 520);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startXY.current || !longPressTimer.current) return;
    const dx = Math.abs(e.clientX - startXY.current.x);
    const dy = Math.abs(e.clientY - startXY.current.y);
    if (dx > 10 || dy > 10) clearTimer();
  };

  const handlePointerUp = () => {
    clearTimer();
    startXY.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      e.preventDefault();
    }
  };

  return (
    <Link
      href={href}
      className="shelf-cover"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 42% 38%), hsl(${(hue + 36) % 360} 36% 28%))`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      <span className="shelf-cover-badge">平台</span>
      <span className="shelf-cover-title">{book.title}</span>
    </Link>
  );
}
