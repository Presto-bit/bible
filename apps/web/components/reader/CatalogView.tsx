'use client';

import { useEffect, useState } from 'react';
import PageBackBar from '@/components/PageBackBar';
import type { BibleBook } from '@/lib/api';
import { allowedChaptersForBook, isChapterInPlan, planBooksInSteps } from '@/lib/plan_navigation';
import type { PlanStep } from '@/lib/plan_steps';
import { clearReaderChrome } from '@/lib/reader_chrome';
import { catalogUi } from '@/lib/reader_i18n';
import { getLastRead } from '@/lib/reading';

type CatalogTab = 'books' | 'chapters';

type CatalogProps = {
  books: BibleBook[];
  currentBookId?: string;
  currentChapter?: number;
  showBack: boolean;
  onBack?: () => void;
  onPickChapter: (book: BibleBook, chapter: number) => void;
  bookAbbr: (name: string, bookId?: string) => string;
  /** KJV 等英文正文译本：目录与卷名用英文 */
  englishUI?: boolean;
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
  englishUI = false,
  planSteps,
}: CatalogProps) {
  const ui = catalogUi(englishUI);
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

  const last = !planSteps?.length ? getLastRead() : null;
  const lastBook = last ? books.find((b) => b.id === last.bookId) : null;

  const tryPickChapter = (b: BibleBook, n: number) => {
    if (planSteps?.length && !isChapterInPlan(planSteps, b.id, n)) {
      setPickWarn(ui.planWarnChapter);
      return;
    }
    setPickWarn(null);
    onPickChapter(b, n);
  };

  const pickBook = (b: BibleBook) => {
    if (planBookIds && !planBookIds.has(b.id)) {
      setPickWarn(ui.planWarnBook);
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
      <p className="section-label tab-section-label catalog-section-label">{label}</p>
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
            <span className="catalog-abbr">{bookAbbr(b.name, b.id)}</span>
            <span className="catalog-name">{b.name}</span>
            <span className="catalog-ch">
              {englishUI ? `${b.chapter_count}${ui.chaptersUnit}` : `${b.chapter_count} ${ui.chaptersUnit.trim()}`}
            </span>
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
      <div className="reader-bar catalog-page-bar">
        <h2 className="catalog-page-title">
          {showBack && onBack && (
            <PageBackBar variant="sheet" ariaLabel="返回" onClick={onBack} />
          )}
          {ui.title}{planSteps?.length ? ui.planMode : ''}
        </h2>
      </div>

      {lastBook && last && tab === 'books' ? (
        <button
          type="button"
          className="card row-card home-list-row catalog-resume-card"
          onClick={() => tryPickChapter(lastBook, last.chapter)}
        >
          <span className="pill pill-active">{ui.resume}</span>
          <span className="home-list-main">
            <strong>
              {englishUI
                ? `${lastBook.name} ${last.chapter}`
                : `${lastBook.name} ${last.chapter} ${ui.chaptersUnit.trim()}`}
            </strong>
            <span className="muted home-list-sub">{ui.resumeSub}</span>
          </span>
          <span className="muted home-list-chevron">›</span>
        </button>
      ) : !planSteps?.length && tab === 'books' ? (
        <div className="catalog-start-block">
          <button
            type="button"
            className="btn catalog-start-primary"
            onClick={() => {
              const jhn = books.find((b) => b.id === 'JHN');
              if (jhn) tryPickChapter(jhn, 1);
            }}
          >
            {ui.startJohn}
          </button>
          <p className="muted catalog-start-hint">{ui.startHint}</p>
        </div>
      ) : null}

      {pickWarn && (
        <p className="muted plan-catalog-warn" style={{ fontSize: 13, marginBottom: 10 }}>
          {pickWarn}
        </p>
      )}

      {planSteps?.length ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          {ui.planOnly}
        </p>
      ) : null}

      <div className="seg-tabs catalog-seg-tabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`seg-tab ${tab === 'books' ? 'seg-tab-active' : ''}`}
          onClick={() => setTab('books')}
        >
          {ui.booksTab}
        </button>
        <button
          type="button"
          className={`seg-tab ${tab === 'chapters' ? 'seg-tab-active' : ''}`}
          onClick={() => setTab('chapters')}
          disabled={!selectedBook}
        >
          {ui.chaptersTab}
        </button>
      </div>

      {tab === 'books' ? (
        <>
          {ot.length > 0 && renderBookGroup(ui.ot, ot)}
          {nt.length > 0 && renderBookGroup(ui.nt, nt)}
        </>
      ) : selectedBook ? (
        <div className="catalog-chapters-panel">
          <div className="catalog-chapters-head">
            <strong>{selectedBook.name}</strong>
            <span className="muted">
              {englishUI
                ? `${selectedBook.chapter_count} chapters`
                : `${ui.chaptersTotal} ${selectedBook.chapter_count} ${ui.chaptersUnit.trim()}`}
            </span>
            <button type="button" className="text-link" onClick={() => setTab('books')}>
              {ui.switchBook}
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
          {englishUI ? 'Choose a book first' : '请先在「分卷」中选择一卷书'}
        </p>
      )}
    </main>
  );
}

export default CatalogView;
