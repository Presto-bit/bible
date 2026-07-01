'use client';

import { useCallback, useState } from 'react';
import {
  isThoughtLiked,
  sortedThoughts,
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
  onClose,
}: {
  refStr: string;
  refLabel: string;
  verseText: string;
  onClose: () => void;
}) {
  const [thoughts, setThoughts] = useState<ThoughtRow[]>(() => sortedThoughts(refStr));

  const refresh = useCallback(() => {
    setThoughts(sortedThoughts(refStr));
  }, [refStr]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet card thoughts-list-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row" style={{ marginTop: 0 }}>
          <strong>今日安排 · 想法</strong>
          <button type="button" className="text-link" onClick={onClose}>关闭</button>
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
              return (
                <div key={t.id} className="thought-item">
                  <div className="thought-item-head">
                    <strong>{t.authorName}</strong>
                    <span className="muted">{timeLabel(t.createdAtMs)}</span>
                  </div>
                  <p className="thought-item-body">{t.body}</p>
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
