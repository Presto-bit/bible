'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WrappedSlide, WrappedStats } from '@/lib/wrapped';

type Props = {
  stats: WrappedStats;
  onShare: () => void;
  shareHint?: string | null;
  sharing?: boolean;
};

export default function WrappedStory({ stats, onShare, shareHint, sharing }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const slides = stats.slides;
  const total = slides.length;

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !el.clientHeight) return;
    const next = Math.round(el.scrollTop / el.clientHeight);
    setIndex(Math.max(0, Math.min(total - 1, next)));
  }, [total]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => syncIndex();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [syncIndex]);

  const go = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(total - 1, i));
    el.scrollTo({ top: clamped * el.clientHeight, behavior: 'smooth' });
    setIndex(clamped);
  };

  return (
    <div className={`wrapped-story wrapped-story--${stats.period}`}>
      <div className="wrapped-story-progress" aria-hidden>
        {slides.map((s, i) => (
          <button
            key={s.kind}
            type="button"
            className={`wrapped-story-pip${i === index ? ' is-on' : ''}${i < index ? ' is-done' : ''}`}
            onClick={() => go(i)}
            aria-label={`第 ${i + 1} 屏`}
          />
        ))}
      </div>

      <div
        ref={scrollerRef}
        className="wrapped-story-scroller"
        onScroll={syncIndex}
      >
        {slides.map((slide, i) => (
          <WrappedSlideView
            key={slide.kind}
            slide={slide}
            period={stats.period}
            active={i === index}
            isLast={i === total - 1}
            onShare={onShare}
            shareHint={shareHint}
            sharing={sharing}
            onNext={() => go(i + 1)}
          />
        ))}
      </div>

      {index < total - 1 ? (
        <button
          type="button"
          className="wrapped-story-next"
          onClick={() => go(index + 1)}
          aria-label="下一屏"
        >
          下滑继续
        </button>
      ) : null}
    </div>
  );
}

function WrappedSlideView({
  slide,
  period,
  active,
  isLast,
  onShare,
  shareHint,
  sharing,
  onNext,
}: {
  slide: WrappedSlide;
  period: WrappedStats['period'];
  active: boolean;
  isLast: boolean;
  onShare: () => void;
  shareHint?: string | null;
  sharing?: boolean;
  onNext: () => void;
}) {
  return (
    <section
      className={`wrapped-slide wrapped-slide--${slide.kind}${active ? ' is-active' : ''}`}
      data-period={period}
      aria-hidden={!active}
    >
      <div className="wrapped-slide-inner">
        <p className="wrapped-slide-kicker">{slide.kicker}</p>
        <h2 className="wrapped-slide-title">{slide.title}</h2>
        {slide.body ? <p className="wrapped-slide-body">{slide.body}</p> : null}

        {slide.metrics && slide.metrics.length > 0 ? (
          <div className={`wrapped-slide-metrics wrapped-slide-metrics--${slide.metrics.length}`}>
            {slide.metrics.map((m) => (
              <div key={`${m.label}-${m.value}`} className="wrapped-slide-metric">
                <strong>{m.value}</strong>
                <span>{m.label}</span>
              </div>
            ))}
          </div>
        ) : null}

        {isLast ? (
          <div className="wrapped-slide-actions">
            <button
              type="button"
              className="btn wrapped-share-btn"
              disabled={sharing}
              onClick={onShare}
            >
              {sharing ? '生成中…' : '生成分享图'}
            </button>
            {shareHint ? (
              <p className="wrapped-share-hint" role="status">
                {shareHint}
              </p>
            ) : (
              <p className="wrapped-share-hint muted">可发朋友圈 / 微信 · 不含笔记正文</p>
            )}
          </div>
        ) : (
          <button type="button" className="wrapped-slide-tap" onClick={onNext}>
            继续
          </button>
        )}
      </div>
    </section>
  );
}
