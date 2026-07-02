'use client';

import { useState } from 'react';
import type { Citation } from '@/lib/api';

type Props = {
  citations: Citation[];
  className?: string;
  activeN?: number | null;
  onActiveChange?: (n: number | null) => void;
};

export function CitationBar({
  citations,
  className,
  activeN: controlled,
  onActiveChange,
}: Props) {
  const [internal, setInternal] = useState<number | null>(null);
  const open = controlled !== undefined ? controlled : internal;
  const setOpen = (n: number | null) => {
    if (onActiveChange) onActiveChange(n);
    else setInternal(n);
  };

  if (!citations.length) return null;

  return (
    <div className={className ?? 'assistant-citations'}>
      <button
        type="button"
        className="assistant-citations-toggle"
        onClick={() => setOpen(open == null ? citations[0].n : null)}
      >
        参考注释（{citations.length}）
        <span className="muted">{open != null ? '收起' : '展开'}</span>
      </button>
      {(open != null || controlled != null) && (
        <div className="assistant-citations-list">
          {citations.map((c) => (
            <div
              key={c.n}
              className={`assistant-citation-item${open === c.n ? ' active' : ''}`}
            >
              <button
                type="button"
                className="assistant-citation-head"
                onClick={() => setOpen(open === c.n ? null : c.n)}
              >
                <span className="assistant-citation-n">[{c.n}]</span>
                <span className="assistant-citation-title">{c.title}</span>
              </button>
              {open === c.n && c.snippet && (
                <p className="assistant-citation-snippet">{c.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
