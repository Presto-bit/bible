'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';

type Props = {
  refParam: string;
  kind?: 'checkin' | 'thought' | 'note';
};

export function FeedVersePreview({ refParam, kind = 'checkin' }: Props) {
  const [label, setLabel] = useState(() => formatGroupRefLabel(refParam));
  const [snippet, setSnippet] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        const max = 80;
        setSnippet(combined.length > max ? `${combined.slice(0, max)}…` : combined);
      })
      .catch(() => {
        if (!cancelled) setSnippet('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  return (
    <aside className={`feed-verse feed-verse--${kind}`} aria-label={label}>
      <div className="feed-verse-mark" aria-hidden>经</div>
      <div className="feed-verse-inner">
        <div className="feed-verse-ref">{label}</div>
        {loading ? (
          <div className="feed-verse-skeleton" aria-hidden>
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p className="feed-verse-text">{snippet || '…'}</p>
        )}
      </div>
    </aside>
  );
}
