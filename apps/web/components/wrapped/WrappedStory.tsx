'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import type { WrappedSlide, WrappedStats } from '@/lib/wrapped';
import { renderWrappedSharePng } from '@/lib/wrapped_share';

type Props = {
  stats: WrappedStats;
  onShare: () => void;
  shareHint?: string | null;
  sharing?: boolean;
};

export default function WrappedStory({ stats, onShare, shareHint, sharing }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const slides = stats.slides;
  const total = slides.length;

  useEffect(() => {
    setIndex(0);
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [stats.period]);

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

  useEffect(() => {
    let cancelled = false;
    if (index < total - 1) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    // 分享图延后：安卓壳上 canvas 很容易卡滑动
    const delay = /PeiaiAndroidShell\//i.test(navigator.userAgent) ? 700 : 180;
    const timer = window.setTimeout(() => {
      void renderWrappedSharePng(stats, { scale: 0.3 }).then((blob) => {
        if (cancelled) return;
        if (!blob) {
          setPreviewing(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPreviewing(false);
      });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    index,
    total,
    stats.period,
    stats.label,
    stats.highlight,
    stats.yearVerse?.ref,
    stats.yearVerse?.text,
    stats.topBookName,
    stats.totalMinutes,
    stats.activeDays,
    stats.streak,
    stats.chapters,
  ]);

  useEffect(
    () => () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    },
    [],
  );

  const go = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const h = el.clientHeight || window.innerHeight;
    if (!h) return;
    const clamped = Math.max(0, Math.min(total - 1, i));
    // 安卓 WebView 上 smooth 滚动易导致卡顿/无法翻页
    const smooth = !/PeiaiAndroidShell\//i.test(navigator.userAgent);
    el.scrollTo({ top: clamped * h, behavior: smooth ? 'smooth' : 'auto' });
    setIndex(clamped);
  };

  // 布局确定后校准一次 index（WebView 首帧 clientHeight 可能为 0）
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => syncIndex())
      : null;
    ro?.observe(el);
    const t = window.setTimeout(syncIndex, 60);
    return () => {
      ro?.disconnect();
      window.clearTimeout(t);
    };
  }, [syncIndex, total, stats.period]);

  return (
    <div className={`wrapped-story wrapped-story--${stats.period}`}>
      <div className="wrapped-story-progress" aria-hidden>
        {slides.map((s, i) => (
          <button
            key={`${s.kind}-${i}`}
            type="button"
            className={`wrapped-story-pip${i === index ? ' is-on' : ''}${i < index ? ' is-done' : ''}`}
            onClick={() => go(i)}
            aria-label={`第 ${i + 1} 屏`}
          />
        ))}
      </div>

      <div ref={scrollerRef} className="wrapped-story-scroller" onScroll={syncIndex}>
        {slides.map((slide, i) => (
          <WrappedSlideView
            key={`${slide.kind}-${i}`}
            slide={slide}
            period={stats.period}
            active={i === index}
            isLast={i === total - 1}
            previewUrl={previewUrl}
            previewing={previewing}
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
  previewUrl,
  previewing,
  onShare,
  shareHint,
  sharing,
  onNext,
}: {
  slide: WrappedSlide;
  period: WrappedStats['period'];
  active: boolean;
  isLast: boolean;
  previewUrl: string | null;
  previewing: boolean;
  onShare: () => void;
  shareHint?: string | null;
  sharing?: boolean;
  onNext: () => void;
}) {
  const bg = dailyVerseWallpaperUrl(slide.wallpaperDay, 'full');

  return (
    <section
      className={`wrapped-slide wrapped-slide--${slide.kind}${active ? ' is-active' : ''}`}
      data-period={period}
      aria-hidden={!active}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="wrapped-slide-bg-img" src={bg} alt="" aria-hidden decoding="async" loading={active ? 'eager' : 'lazy'} />
      <div className="wrapped-slide-bg" aria-hidden />
      <div className="wrapped-slide-scrim" aria-hidden />
      <div className="wrapped-slide-inner">
        <p className="wrapped-slide-kicker">{slide.kicker}</p>

        {slide.kind === 'verse' ? (
          <>
            <h2 className="wrapped-slide-title wrapped-slide-title--verse">{slide.title}</h2>
            {slide.body ? <p className="wrapped-slide-body wrapped-slide-cite">{slide.body}</p> : null}
          </>
        ) : slide.kind === 'quotes' && slide.quotes ? (
          <>
            <h2 className="wrapped-slide-title">{slide.title}</h2>
            {slide.body ? <p className="wrapped-slide-body">{slide.body}</p> : null}
            <ul className="wrapped-quote-list">
              {slide.quotes.map((q) => (
                <li key={q.ref} className="wrapped-quote-item">
                  <p className="wrapped-quote-text">
                    {q.text ? `「${q.text}」` : q.label}
                  </p>
                  {q.text ? <span className="wrapped-quote-ref">{q.label}</span> : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="wrapped-slide-title">{slide.title}</h2>
            {slide.body ? <p className="wrapped-slide-body">{slide.body}</p> : null}
            {slide.metrics && slide.metrics.length > 0 ? (
              <div
                className={`wrapped-slide-metrics wrapped-slide-metrics--${Math.min(slide.metrics.length, 3)}`}
              >
                {slide.metrics.map((m) => (
                  <div key={`${m.label}-${m.value}`} className="wrapped-slide-metric">
                    <strong>{m.value}</strong>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}

        {isLast ? (
          <div className="wrapped-slide-actions">
            <div className="wrapped-share-preview">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="分享海报预览" className="wrapped-share-preview-img" />
              ) : (
                <div className="wrapped-share-preview-ph">
                  {previewing ? '生成预览…' : '海报预览'}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn wrapped-share-btn"
              disabled={sharing}
              onClick={onShare}
            >
              {sharing ? '生成中…' : '分享海报'}
            </button>
            {shareHint ? (
              <p className="wrapped-share-hint" role="status">
                {shareHint}
              </p>
            ) : (
              <p className="wrapped-share-hint muted">一图含经文与足迹 · 可发朋友圈</p>
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
