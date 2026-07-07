'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type TimelineTour } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { refSpaceToOsis } from '@/lib/inline_ref';
import { recordTimelineTour } from '@/lib/badge_events';
import { VersePreviewSheet } from '@/components/reader/VersePreviewSheet';
import PageBackBar from '@/components/PageBackBar';
import { useFlowBack } from '@/lib/use_edge_swipe_back';

function eventRef(ev: { ref?: string; book: string; chapter: number; verse?: number }) {
  if (ev.ref?.trim()) return ev.ref.trim();
  const v = ev.verse ?? 1;
  return `${ev.book} ${ev.chapter}:${v}`;
}

export function TimelineStoryMode({
  tourId,
  backHref = '/search',
  backLabel = '搜索',
}: {
  tourId: string;
  backHref?: string;
  backLabel?: string;
}) {
  const goBack = useFlowBack(backHref);
  const [tour, setTour] = useState<TimelineTour | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ osis: string; label: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    setStep(0);
    void api
      .timelineTour(tourId)
      .then((d) => {
        setTour(d.tour);
        recordTimelineTour(tourId);
      })
      .catch(() => setTour(null))
      .finally(() => setLoading(false));
  }, [tourId]);

  const events = tour?.events ?? [];
  const current = events[step] ?? null;

  const openRef = (ref: string) => {
    const href = readerHrefFromRef(ref);
    if (href) window.location.href = href;
    else {
      setPreview({
        osis: refSpaceToOsis(ref.replace(/\./g, ' ')),
        label: formatGroupRefLabel(ref) || ref,
      });
    }
  };

  if (loading) {
    return <p className="muted">加载时间线…</p>;
  }
  if (!tour || !current) {
    return <p className="muted">未找到该时间线</p>;
  }

  const isLast = step >= events.length - 1;
  const ref = eventRef(current);

  return (
    <>
      <header className="page-head story-mode-head">
        <PageBackBar onClick={goBack} label={backLabel} />
        <h2 className="page-head-title">{tour.title}</h2>
      </header>
      {tour.subtitle ? (
        <p className="muted story-mode-sub">{tour.subtitle}</p>
      ) : null}

      <div className="story-mode-timeline-rail" role="tablist" aria-label="时间线节点">
        {events.map((ev, idx) => (
          <button
            key={ev.order}
            type="button"
            role="tab"
            aria-selected={idx === step}
            className={`story-mode-timeline-chip${idx === step ? ' is-active' : ''}`}
            onClick={() => setStep(idx)}
          >
            {ev.year_display || idx + 1}
          </button>
        ))}
      </div>

      <div className="story-mode-progress" aria-live="polite">
        第 <strong>{step + 1}</strong> / {events.length} 个节点
      </div>

      <div className="card card-2 story-mode-card">
        <strong className="story-mode-stop-title">
          {current.label}
          {current.year_display ? (
            <span className="muted story-step-year"> · {current.year_display}</span>
          ) : null}
        </strong>
        {current.note ? (
          <p className="muted story-mode-stop-note">{current.note}</p>
        ) : null}
        {tour.description && step === 0 ? (
          <p className="story-mode-lead">{tour.description}</p>
        ) : null}
      </div>

      <div className="story-mode-actions">
        <button type="button" className="font-pill accent" onClick={() => openRef(ref)}>
          读本节 · {formatGroupRefLabel(ref) || ref}
        </button>
        {!isLast ? (
          <button type="button" className="font-pill" onClick={() => setStep((s) => s + 1)}>
            下一节点 · {events[step + 1]?.label} ›
          </button>
        ) : (
          <button type="button" className="font-pill" onClick={() => setStep(0)}>
            回到起点
          </button>
        )}
        {step > 0 ? (
          <button type="button" className="text-link story-mode-back-step" onClick={() => setStep((s) => s - 1)}>
            ‹ 上一节点
          </button>
        ) : null}
      </div>

      <div className="story-mode-footer-links">
        <Link href="/search/timeline" className="text-link">切换时间线</Link>
      </div>

      {preview ? (
        <VersePreviewSheet
          refParam={preview.osis}
          refLabel={preview.label}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </>
  );
}
