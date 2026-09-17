'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import type { ShelfBookSummary } from '@/lib/shelf_api';
import { shelfBookCardHref } from '@/lib/shelf_library';
import { navigateAppHref } from '@/lib/pwa_tab_nav';
import ShelfBrandCover from '@/components/shelf/ShelfBrandCover';
import { shelfBookProgressRatio, shelfBookCardMetaLine } from '@/lib/shelf_library';

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
  const progressRatio = shelfBookProgressRatio(book.id);
  const isCollection = book.book_type === 'collection';
  const metaLine = isCollection ? null : shelfBookCardMetaLine(book.id, book);
  const metaText = isCollection
    ? `合集 · ${book.section_count} 份`
    : metaLine;
  const hasMeta = Boolean(metaText);

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
        {progressRatio != null && progressRatio > 0 ? (
          <div className="shelf-book-card-progress" aria-hidden>
            <div
              className="shelf-book-card-progress-fill"
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
      <div className="shelf-book-card-text">
        <p className={`shelf-book-card-title${hasMeta ? ' is-compact' : ''}`}>{book.title}</p>
        {hasMeta ? <p className="shelf-book-card-meta muted">{metaText}</p> : null}
      </div>
    </div>
  );
}
