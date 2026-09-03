'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { loadShelfBookProgress, shelfCoverHue, type ShelfBookSummary } from '@/lib/shelf_api';

type Props = {
  book: ShelfBookSummary;
  onManage?: (book: ShelfBookSummary) => void;
};

const LONG_PRESS_MS = 520;

export default function ShelfCoverTile({ book, onManage }: Props) {
  const router = useRouter();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startXY = useRef<{ x: number; y: number } | null>(null);

  const progress = loadShelfBookProgress(book.id);
  const href = progress
    ? `/shelf/${book.id}/read?section=${encodeURIComponent(progress.sectionId)}${
        typeof progress.pageIndex === 'number' && progress.pageIndex > 0
          ? `&page=${progress.pageIndex}`
          : ''
      }`
    : `/shelf/${book.id}`;
  const hue = shelfCoverHue(book.title);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const triggerManage = useCallback(() => {
    if (!onManage) return;
    longPressFired.current = true;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    onManage(book);
  }, [book, onManage]);

  const startLongPress = useCallback(
    (x: number, y: number) => {
      if (!onManage) return;
      longPressFired.current = false;
      clearTimer();
      startXY.current = { x, y };
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        triggerManage();
      }, LONG_PRESS_MS);
    },
    [clearTimer, onManage, triggerManage],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onManage) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startLongPress(e.clientX, e.clientY);
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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onManage) return;
    const t = e.changedTouches[0];
    if (!t) return;
    startLongPress(t.clientX, t.clientY);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onManage) return;
    e.preventDefault();
    triggerManage();
  };

  const handleActivate = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    router.push(`/shelf/${book.id}`);
  };

  return (
    <div
      role="link"
      tabIndex={0}
      className="shelf-cover"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 42% 38%), hsl(${(hue + 36) % 360} 36% 28%))`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handlePointerUp}
      onTouchCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <span className="shelf-cover-title">{book.title}</span>
      <span className="shelf-cover-badge">平台</span>
    </div>
  );
}
