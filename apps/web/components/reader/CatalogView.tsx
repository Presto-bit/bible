'use client';

import { useEffect, useState } from 'react';
import type { BibleBook } from '@/lib/api';
import { allowedChaptersForBook, isChapterInPlan, planBooksInSteps } from '@/lib/plan_navigation';
import type { PlanStep } from '@/lib/plan_steps';
import { clearReaderChrome } from '@/lib/reader_chrome';

type CatalogTab = 'books' | 'chapters';

type CatalogProps = {
  books: BibleBook[];
  currentBookId?: string;
  currentChapter?: number;
  showBack: boolean;
  onBack?: () => void;
  onPickChapter: (book: BibleBook, chapter: number) => void;
  bookAbbr: (name: string) => string;
  /** 计划模式：仅允许跳转今日 Step 章节 */
  planSteps?: PlanStep[];
};

function CatalogView({
  books,
  currentBookId,
  currentChapter = 1,
  showBack,
  onBack,
  onPickChapter,
  bookAbbr,
  planSteps,
}: CatalogProps) {
  const [tab, setTab] = useState<CatalogTab>('books');
  const [pickWarn, setPickWarn] = useState<string | null>(null);
  const [selectedBookId, setSelectedBookId] = useState(
    () => currentBookId || books[0]?.id || '',
  );

  useEffect(() => {
    clearReaderChrome();
  }, []);

  useEffect(() => {
    if (currentBookId) setSelectedBookId(currentBookId);
  }, [currentBookId]);

  useEffect(() => {
    if (!selectedBookId && books[0]) setSelectedBookId(books[0].id);
  }, [books, selectedBookId]);

  useEffect(() => {
    if (!currentBookId || tab !== 'books') return;
    const el = document.getElementById(`catalog-book-${currentBookId}`);
    el?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [currentBookId, tab]);

  const selectedBook = books.find((b) => b.id === selectedBookId) ?? books[0] ?? null;
  const planBookIds = planSteps?.length ? new Set(planBooksInSteps(planSteps)) : null;
  const visibleBooks = planBookIds
    ? books.filter((b) => planBookIds.has(b.id))
    : books;

  const tryPickChapter = (b: BibleBook, n: number) => {
    if (planSteps?.length && !isChapterInPlan(planSteps, b.id, n)) {
      setPickWarn('该章节不在今日计划内，请从计划段列表选择');
      return;
    }
    setPickWarn(null);
    onPickChapter(b, n);
  };

  const pickBook = (b: BibleBook) => {
    if (planBookIds && !planBookIds.has(b.id)) {
      setPickWarn('该经卷不在今日计划内');
      return;
    }
    setSelectedBookId(b.id);
    setTab('chapters');
    setPickWarn(null);
  };

  const renderBookGroup = (label: string, list: BibleBook[]) => {
    const items = planBookIds ? list.filter((b) => planBookIds.has(b.id)) : list;
    if (!items.length) return null;
    return (
    <>
      <p className="section-head">{label}</p>
      <div className="catalog-grid">
        {items.map((b) => (
          <button
            key={b.id}
            id={`catalog-book-${b.id}`}
            type="button"
            className={`catalog-card${
              selectedBookId === b.id ? ' catalog-card-active' : ''
            }${currentBookId === b.id ? ' catalog-card-reading' : ''}${
              planBookIds && !planBookIds.has(b.id) ? ' catalog-card-disabled' : ''
            }`}
            onClick={() => pickBook(b)}
          >
            <span className="catalog-abbr">{bookAbbr(b.name)}</span>
            <span className="catalog-name">{b.name}</span>
            <span className="catalog-ch">{b.chapter_count} 章</span>
          </button>
        ))}
      </div>
    </>
    );
  };

  const ot = visibleBooks.filter((b) => b.testament.toUpperCase().startsWith('O'));
  const nt = visibleBooks.filter((b) => !b.testament.toUpperCase().startsWith('O'));
  const allowedChapters = selectedBook && planSteps?.length
    ? new Set(allowedChaptersForBook(planSteps, selectedBook.id))
    : null;

  return (
    <main className="container reader-catalog-page">
      <div className="reader-bar" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          {showBack && onBack && (
            <button type="button" className="icon-btn" aria-label="返回" onClick={onBack}>
              ‹
            </button>
          )}
          圣经目录{planSteps?.length ? ' · 计划模式' : ''}
        </h2>
      </div>

      {pickWarn && (
        <p className="muted plan-catalog-warn" style={{ fontSize: 13, marginBottom: 10 }}>
          {pickWarn}
        </p>
      )}

      {planSteps?.length ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          仅显示今日计划经卷与章节
        </p>
      ) : null}

      <div className="seg-tabs catalog-seg-tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`seg-tab ${tab === 'books' ? 'seg-tab-active' : ''}`}
          onClick={() => setTab('books')}
        >
          分卷
        </button>
        <button
          type="button"
          className={`seg-tab ${tab === 'chapters' ? 'seg-tab-active' : ''}`}
          onClick={() => setTab('chapters')}
          disabled={!selectedBook}
        >
          章节
        </button>
      </div>

      {tab === 'books' ? (
        <>
          {ot.length > 0 && renderBookGroup('旧约', ot)}
          {nt.length > 0 && renderBookGroup('新约', nt)}
        </>
      ) : selectedBook ? (
        <div className="catalog-chapters-panel">
          <div className="catalog-chapters-head">
            <strong>{selectedBook.name}</strong>
            <span className="muted">共 {selectedBook.chapter_count} 章</span>
            <button type="button" className="text-link" onClick={() => setTab('books')}>
              换卷 ›
            </button>
          </div>
          <div className="chapter-grid catalog-chapter-grid">
            {Array.from({ length: selectedBook.chapter_count }, (_, i) => i + 1).map((n) => {
              const disabled = allowedChapters != null && !allowedChapters.has(n);
              return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                className={`chapter-cell${
                  currentBookId === selectedBook.id && currentChapter === n
                    ? ' chapter-cell-active'
                    : ''
                }${disabled ? ' chapter-cell-disabled' : ''}`}
                onClick={() => tryPickChapter(selectedBook, n)}
              >
                {n}
              </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
          请先在「分卷」中选择一卷书
        </p>
      )}
    </main>
  );
}

export default CatalogView;
