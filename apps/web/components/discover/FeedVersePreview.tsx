'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';

type Props = {
  refParam: string;
  kind?: 'checkin' | 'thought' | 'note';
  href?: string | null;
};

export function FeedVersePreview({ refParam, kind = 'checkin', href }: Props) {
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
        const max = 140;
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

  const className = `feed-verse-hero feed-verse-hero--${kind}`;
  const inner = (
    <>
      <div className="feed-verse-hero-mark" aria-hidden>
        {kind === 'note' ? '记' : '经'}
      </div>
      <div className="feed-verse-hero-inner">
        <div className="feed-verse-hero-ref">{label}</div>
        {loading ? (
          <div className="feed-verse-hero-skeleton" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p className="feed-verse-hero-text">{snippet ? `「${snippet}」` : '…'}</p>
        )}
      </div>
      {href && <span className="feed-verse-hero-cta muted">阅读经文 →</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-label={`阅读 ${label}`}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} aria-label={label}>
      {inner}
    </div>
  );
}
