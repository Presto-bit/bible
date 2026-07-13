'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import { api } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { markRouteNavigation } from '@/lib/pwa_tab_nav';

type Props = {
  refParam: string;
  kind?: 'checkin' | 'thought' | 'note';
  href?: string | null;
};

/** @deprecated 大 Hero 预览；发现页已改用 FeedVerseLine 紧凑行 */
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
      <Link
        href={href}
        className={className}
        aria-label={`阅读 ${label}`}
        onClick={() => markRouteNavigation()}
      >
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

type LineProps = {
  refParam: string;
  href?: string | null;
  /** 想法/笔记：有 ref 时在经文后附一行摘要优先显示正文 */
  bodyHint?: string | null;
};

/** 紧凑卡第 2 行：经文引用 + 一行摘录 */
export function FeedVerseLine({ refParam, href, bodyHint }: LineProps) {
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
        const max = 48;
        setSnippet(combined.length > max ? `${combined.slice(0, max)}…` : combined);
      })
      .catch(() => {
        if (!cancelled) setSnippet('');
      });
    return () => {
      cancelled = true;
    };
  }, [refParam]);

  const hint = bodyHint?.trim();
  const secondary = hint || (snippet ? `「${snippet}」` : '');

  const onNav = (e: MouseEvent) => {
    e.stopPropagation();
    markRouteNavigation();
  };

  const inner = (
    <>
      <span className="feed-verse-line-ref">{label}</span>
      {secondary ? <span className="feed-verse-line-text">{secondary}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="feed-verse-line"
        aria-label={`阅读 ${label}`}
        onClick={onNav}
      >
        {inner}
      </Link>
    );
  }

  return <div className="feed-verse-line">{inner}</div>;
}
