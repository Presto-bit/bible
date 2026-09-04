'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';
import type { ShelfBookSummary } from '@/lib/shelf_api';
import {
  shelfBookCardHref,
  shelfBookDetailHref,
} from '@/lib/shelf_library';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import ShelfBrandCover from '@/components/shelf/ShelfBrandCover';

type Props = {
  book: ShelfBookSummary;
  coverUrl?: string | null;
  actionMenuOpen?: boolean;
  onActionMenu?: (book: ShelfBookSummary, anchorEl: HTMLElement) => void;
};

const LONG_PRESS_MS = 520;

export default function ShelfBookCard({ book, coverUrl, actionMenuOpen, onActionMenu }: Props) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startXY = useRef<{ x: number; y: number } | null>(null);

  const href = shelfBookCardHref(book.id);
  const detailHref = shelfBookDetailHref(book.id);

  const clearTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const triggerLongPress = useCallback(() => {
    if (!onActionMenu || !cardRef.current) return;
    longPressFired.current = true;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    onActionMenu(book, cardRef.current);
  }, [book, onActionMenu]);

  const startLongPress = useCallback(
    (x: number, y: number) => {
      if (!onActionMenu) return;
      longPressFired.current = false;
      clearTimer();
      startXY.current = { x, y };
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null;
        triggerLongPress();
      }, LONG_PRESS_MS);
    },
    [clearTimer, onActionMenu, triggerLongPress],
  );

  const openDetail = (e: MouseEvent | PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigateAppHref(detailHref, router);
  };

  const handleActivate = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    // 与「我的→书架」一致：soft-nav 进度 + 保活同步，避免弱网/PWA「点了没反应」
    navigateAppHref(href, router);
  };

  return (
    <div
      ref={cardRef}
      role="link"
      tabIndex={0}
      className={`shelf-book-card${actionMenuOpen ? ' is-action-open' : ''}`}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startLongPress(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!startXY.current || !longPressTimer.current) return;
        if (Math.abs(e.clientX - startXY.current.x) > 10 || Math.abs(e.clientY - startXY.current.y) > 10) {
          clearTimer();
        }
      }}
      onPointerUp={() => {
        clearTimer();
        startXY.current = null;
      }}
      onPointerLeave={() => {
        clearTimer();
        startXY.current = null;
      }}
      onContextMenu={(e) => {
        if (!onActionMenu) return;
        e.preventDefault();
        triggerLongPress();
      }}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
    >
      <div className="shelf-book-card-cover">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="shelf-book-card-image" draggable={false} />
        ) : (
          <ShelfBrandCover />
        )}
        <button
          type="button"
          className="shelf-book-card-detail-btn"
          aria-label="书目详情"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={openDetail}
        >
          <span aria-hidden>i</span>
        </button>
      </div>
      <p className="shelf-book-card-title">{book.title}</p>
    </div>
  );
}
