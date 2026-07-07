'use client';

import { SheetCloseButton } from '@/components/PageBackBar';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { effectiveId } from '@/lib/api';
import {
  isThoughtLiked,
  sortedThoughts,
  sortedThoughtsForVerse,
  toggleThoughtLike,
  type ThoughtRow,
} from '@/lib/reader_thoughts';

function timeLabel(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ThoughtsListSheet({
  refStr,
  refLabel,
  verseText,
  bookId,
  chapter,
  verse,
  onChanged,
  onClose,
}: {
  refStr: string;
  refLabel: string;
  verseText: string;
  bookId?: string;
  chapter?: number;
  verse?: number;
  onChanged?: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loadThoughts = useCallback(() => {
    if (bookId != null && chapter != null && verse != null) {
      return sortedThoughtsForVerse(bookId, chapter, verse);
    }
    return sortedThoughts(refStr);
  }, [bookId, chapter, verse, refStr]);

  const [thoughts, setThoughts] = useState<ThoughtRow[]>(() => loadThoughts());
  const uid = effectiveId() || 'me';

  const refresh = useCallback(() => {
    setThoughts(loadThoughts());
    onChanged?.();
  }, [loadThoughts, onChanged]);

  const sheet = (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card thoughts-list-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>本节想法</strong>
          <SheetCloseButton onClick={onClose} />
        </div>

        <div className="thought-verse-card">
          <p className="thought-verse-ref">{refLabel}</p>
          <p className="thought-verse-text">{verseText}</p>
        </div>

        <p className="thoughts-count">{thoughts.length} 条想法</p>

        <div className="thoughts-list-body">
          {thoughts.length === 0 ? (
            <p className="muted thoughts-empty">还没有想法，来做第一个吧</p>
          ) : (
            thoughts.map((t) => {
              const liked = isThoughtLiked(t);
              const mine = t.authorId === uid;
              return (
                <div key={t.id} className="thought-item">
                  <div className="thought-item-head">
                    <strong>{t.authorName}{mine ? ' · 我' : ''}</strong>
                    <span className="muted">{timeLabel(t.createdAtMs)}</span>
                  </div>
                  <p className="thought-item-body">{t.body}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      type="button"
                      className={`thought-like-btn ${liked ? 'thought-like-active' : ''}`}
                      onClick={() => {
                        toggleThoughtLike(t.id);
                        refresh();
                      }}
                    >
                      {liked ? '♥' : '♡'} {t.likesCount}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
