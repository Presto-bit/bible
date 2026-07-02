'use client';

import { useEffect } from 'react';
import type { BibleBook } from '@/lib/api';
import { clearReaderChrome } from '@/lib/reader_chrome';

type CatalogProps = {
  books: BibleBook[];
  currentBookId?: string;
  showBack: boolean;
  onBack?: () => void;
  onPickBook: (b: BibleBook) => void;
  bookAbbr: (name: string) => string;
};

function CatalogView({
  books,
  currentBookId,
  showBack,
  onBack,
  onPickBook,
  bookAbbr,
}: CatalogProps) {
  useEffect(() => {
    clearReaderChrome();
  }, []);

  useEffect(() => {
    if (!currentBookId) return;
    const el = document.getElementById(`catalog-book-${currentBookId}`);
    el?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [currentBookId]);

  const ot = books.filter((b) => b.testament.toUpperCase().startsWith('O'));
  const nt = books.filter((b) => !b.testament.toUpperCase().startsWith('O'));

  const renderGroup = (label: string, list: BibleBook[]) => (
    <>
      <p className="section-head">{label}</p>
      <div className="catalog-grid">
        {list.map((b) => (
          <button
            key={b.id}
            id={`catalog-book-${b.id}`}
            type="button"
            className={`catalog-card${currentBookId === b.id ? ' catalog-card-active' : ''}`}
            onClick={() => onPickBook(b)}
          >
            <span className="catalog-abbr">{bookAbbr(b.name)}</span>
            <span className="catalog-name">{b.name}</span>
            <span className="catalog-ch">{b.chapter_count} 章</span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <main className="container reader-catalog-page">
      <div className="reader-bar" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          {showBack && onBack && (
            <button type="button" className="icon-btn" aria-label="返回" onClick={onBack}>‹</button>
          )}
          圣经目录
        </h2>
      </div>
      {ot.length > 0 && renderGroup('旧约', ot)}
      {nt.length > 0 && renderGroup('新约', nt)}
    </main>
  );
}

export default CatalogView;
