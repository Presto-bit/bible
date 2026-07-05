'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BibleBook } from '@/lib/api';
import { bibleBooks } from '@/lib/bible_client';
import {
  formatPlanChapterRange,
  type PlanChapterRange,
} from '@/lib/plan_content_parse';

type Props = {
  ranges: PlanChapterRange[];
  onChange: (ranges: PlanChapterRange[]) => void;
};

export function PlanChapterPicker({ ranges, onChange }: Props) {
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'OT' | 'NT'>('NT');
  const [bookId, setBookId] = useState<string | null>(null);
  const [fromCh, setFromCh] = useState(1);
  const [toCh, setToCh] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bibleBooks()
      .then((list) => {
        if (!cancelled) {
          setBooks(list);
          const firstNt = list.find((b) => b.testament === 'NT');
          if (firstNt) setBookId(firstNt.id);
        }
      })
      .catch(() => {
        if (!cancelled) setErr('经卷目录加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredBooks = useMemo(
    () => books.filter((b) => b.testament === tab),
    [books, tab],
  );

  const selectedBook = books.find((b) => b.id === bookId) ?? null;

  useEffect(() => {
    if (!selectedBook) return;
    setFromCh(1);
    setToCh(1);
  }, [selectedBook?.id]);

  const addRange = () => {
    if (!selectedBook) return;
    const lo = Math.min(fromCh, toCh);
    const hi = Math.max(fromCh, toCh);
    if (lo < 1 || hi > selectedBook.chapter_count) {
      setErr(`章节须在 1–${selectedBook.chapter_count} 之间`);
      return;
    }
    setErr(null);
    const next: PlanChapterRange = {
      bookId: selectedBook.id,
      bookName: selectedBook.name,
      from: lo,
      to: hi,
    };
    const key = `${next.bookId}.${next.from}-${next.to}`;
    const exists = ranges.some((r) => `${r.bookId}.${r.from}-${r.to}` === key);
    if (exists) return;
    onChange([...ranges, next]);
  };

  const removeRange = (idx: number) => {
    onChange(ranges.filter((_, i) => i !== idx));
  };

  if (loading) {
    return <p className="muted" style={{ fontSize: 12 }}>加载经卷…</p>;
  }

  return (
    <div className="plan-chapter-picker">
      <div className="plan-picker-tabs">
        <button
          type="button"
          className={`font-pill${tab === 'OT' ? ' font-pill-active' : ''}`}
          onClick={() => setTab('OT')}
        >
          旧约
        </button>
        <button
          type="button"
          className={`font-pill${tab === 'NT' ? ' font-pill-active' : ''}`}
          onClick={() => setTab('NT')}
        >
          新约
        </button>
      </div>

      <div className="plan-picker-books">
        {filteredBooks.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`book-chip plan-picker-book${bookId === b.id ? ' active' : ''}`}
            onClick={() => setBookId(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>

      {selectedBook && (
        <div className="plan-picker-range-row">
          <label className="plan-picker-field">
            <span className="muted">起</span>
            <input
              type="number"
              className="search-input plan-picker-num"
              min={1}
              max={selectedBook.chapter_count}
              value={fromCh}
              onChange={(e) => setFromCh(Number(e.target.value))}
            />
          </label>
          <span className="muted">–</span>
          <label className="plan-picker-field">
            <span className="muted">止</span>
            <input
              type="number"
              className="search-input plan-picker-num"
              min={1}
              max={selectedBook.chapter_count}
              value={toCh}
              onChange={(e) => setToCh(Number(e.target.value))}
            />
          </label>
          <button type="button" className="font-pill" onClick={addRange}>
            添加
          </button>
        </div>
      )}

      {ranges.length > 0 && (
        <div className="plan-picker-selected">
          {ranges.map((r, i) => (
            <span key={`${r.bookId}-${r.from}-${r.to}`} className="plan-picker-chip">
              {formatPlanChapterRange(r)}
              <button type="button" className="plan-picker-chip-x" onClick={() => removeRange(i)} aria-label="移除">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {err && <p className="group-composer-err" style={{ marginTop: 6 }}>{err}</p>}
    </div>
  );
}
