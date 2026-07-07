'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { BibleBook } from '@/lib/api';
import { allowedChaptersForBook, isChapterInPlan, planBooksInSteps } from '@/lib/plan_navigation';
import type { PlanStep } from '@/lib/plan_steps';

type LocTab = 'chapters' | 'books';

type Props = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  books: BibleBook[];
  book: BibleBook;
  chapter: number;
  bookAbbr: (name: string) => string;
  planSteps?: PlanStep[];
  onPickChapter: (book: BibleBook, chapter: number) => void;
  onClose: () => void;
};

export function ReaderLocPopover({
  open,
  anchorRef,
  books,
  book,
  chapter,
  bookAbbr,
  planSteps,
  onPickChapter,
  onClose,
}: Props) {
  const [tab, setTab] = useState<LocTab>('chapters');
  const [pickWarn, setPickWarn] = useState<string | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setTab('chapters');
    setPickWarn(null);
  }, [open, book.id]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const maxW = Math.min(340, window.innerWidth - 16);
      let left = r.left;
      if (left + maxW > window.innerWidth - 8) {
        left = window.innerWidth - 8 - maxW;
      }
      setStyle({
        top: r.bottom + 6,
        left: Math.max(8, left),
        width: maxW,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open || tab !== 'chapters') return;
    const el = panelRef.current?.querySelector('.chapter-cell-active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, tab, book.id, chapter]);

  const planBookIds = planSteps?.length ? new Set(planBooksInSteps(planSteps)) : null;
  const visibleBooks = planBookIds
    ? books.filter((b) => planBookIds.has(b.id))
    : books;
  const allowedChapters = planSteps?.length
    ? new Set(allowedChaptersForBook(planSteps, book.id))
    : null;

  const tryPickChapter = (b: BibleBook, n: number) => {
    if (planSteps?.length && !isChapterInPlan(planSteps, b.id, n)) {
      setPickWarn('该章节不在今日计划内');
      return;
    }
    onPickChapter(b, n);
    onClose();
  };

  const pickBook = (b: BibleBook) => {
    if (planBookIds && !planBookIds.has(b.id)) {
      setPickWarn('该经卷不在今日计划内');
      return;
    }
    setPickWarn(null);
    if (b.id === book.id) {
      setTab('chapters');
      return;
    }
    tryPickChapter(b, 1);
  };

  if (!mounted || !open) return null;

  const ot = visibleBooks.filter((b) => b.testament.toUpperCase().startsWith('O'));
  const nt = visibleBooks.filter((b) => !b.testament.toUpperCase().startsWith('O'));

  const renderBookGroup = (label: string, list: BibleBook[]) => {
    if (!list.length) return null;
    return (
      <div key={label} className="reader-loc-book-group">
        <p className="reader-loc-book-label">{label}</p>
        <div className="reader-loc-book-grid">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`reader-loc-book-cell${book.id === b.id ? ' is-active' : ''}`}
              onClick={() => pickBook(b)}
            >
              {bookAbbr(b.name)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const popover = (
    <>
      <div className="reader-loc-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="reader-loc-popover"
        style={style}
        role="dialog"
        aria-label="选择经卷与章节"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reader-loc-popover-head">
          <strong>{book.name}</strong>
          <span className="muted reader-loc-popover-sub">
            {tab === 'chapters' ? `第 ${chapter} 章` : '选卷'}
          </span>
        </div>

        {pickWarn && <p className="reader-loc-warn">{pickWarn}</p>}

        <div className="seg-tabs reader-loc-seg-tabs">
          <button
            type="button"
            className={`seg-tab ${tab === 'chapters' ? 'seg-tab-active' : ''}`}
            onClick={() => { setTab('chapters'); setPickWarn(null); }}
          >
            章
          </button>
          <button
            type="button"
            className={`seg-tab ${tab === 'books' ? 'seg-tab-active' : ''}`}
            onClick={() => { setTab('books'); setPickWarn(null); }}
          >
            卷
          </button>
        </div>

        {tab === 'chapters' ? (
          <div className="reader-loc-chapters">
            <div className="chapter-grid reader-loc-chapter-grid">
              {Array.from({ length: book.chapter_count }, (_, i) => i + 1).map((n) => {
                const disabled = allowedChapters != null && !allowedChapters.has(n);
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    className={`chapter-cell${
                      chapter === n ? ' chapter-cell-active' : ''
                    }${disabled ? ' chapter-cell-disabled' : ''}`}
                    onClick={() => tryPickChapter(book, n)}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="reader-loc-books">
            {renderBookGroup('旧约', ot)}
            {renderBookGroup('新约', nt)}
          </div>
        )}
      </div>
    </>
  );

  return createPortal(popover, document.body);
}
