'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';

export function FeedVersePreview({ refParam }: { refParam: string }) {
  const [label, setLabel] = useState(() => formatGroupRefLabel(refParam));
  const [snippet, setSnippet] = useState('');

  useEffect(() => {
    let cancelled = false;
    void api
      .scriptureRef(refParam)
      .then((d) => {
        if (cancelled) return;
        setLabel(d.display || formatGroupRefLabel(refParam));
        const combined = (d.verses ?? []).map((v) => v.text).join('');
        if (!combined) {
          setSnippet('');
          return;
        }
        const max = 72;
        setSnippet(combined.length > max ? `${combined.slice(0, max)}…` : combined);
      })
      .catch(() => {
        if (!cancelled) setSnippet('');
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  return (
    <aside className="feed-card-verse" aria-label={label}>
      <div className="feed-card-verse-label">{label}</div>
      <p className="feed-card-verse-text">{snippet || '…'}</p>
    </aside>
  );
}
