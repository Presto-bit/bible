'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dailyVerseWallpaperUrl } from '@/lib/daily_verse_wallpaper';
import { isPeiaiAndroidWebViewShell } from '@/lib/android_host';
import { isFlutterH5Host } from '@/lib/flutter_h5_bridge';
import type { WrappedSlide, WrappedStats } from '@/lib/wrapped';
import { renderWrappedSharePng } from '@/lib/wrapped_share';

type Props = {
  stats: WrappedStats;
  onShare: () => void;
  shareHint?: string | null;
  sharing?: boolean;
};

/** 安卓 WebView / Flutter 嵌层：CSS scroll-snap 经常不跟手，改用触摸分页。 */
function isEmbeddedAndroidWebView(): boolean {
  return isFlutterH5Host() || isPeiaiAndroidWebViewShell();
}

function scrollerPageHeight(el: HTMLElement): number {
  return el.clientHeight || el.offsetHeight || window.innerHeight || 0;
}

export default function WrappedStory({ stats, onShare, shareHint, sharing }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const [index, setIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const slides = stats.slides;
  const total = slides.length;
  const totalRef = useRef(total);
  totalRef.current = total;
  indexRef.current = index;
  const embedded = isEmbeddedAndroidWebView();

  useEffect(() => {
    setIndex(0);
    indexRef.current = 0;
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [stats.period]);

  const syncIndex = useCallback(() => {
    const el = scrollerRef.current;
    const h = el ? scrollerPageHeight(el) : 0;
    if (!el || !h) return;
    const next = Math.round(el.scrollTop / h);
    setIndex(Math.max(0, Math.min(totalRef.current - 1, next)));
  }, []);

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
    // 分享图延后：安卓 WebView 上 canvas 很容易卡滑动
    const delay = isEmbeddedAndroidWebView() ? 700 : 180;
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

  const go = useCallback((i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const h = scrollerPageHeight(el);
    if (!h) return;
    const clamped = Math.max(0, Math.min(totalRef.current - 1, i));
    el.scrollTo({
      top: clamped * h,
      behavior: isEmbeddedAndroidWebView() ? 'auto' : 'smooth',
    });
    indexRef.current = clamped;
    setIndex(clamped);
  }, []);

  // Flutter / 旧 WebView：CSS snap 不可靠，用触摸阈值切屏（对齐 PWA「下滑继续」）
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !embedded || total < 2) return;
    let startY = 0;
    let startX = 0;
    let startT = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = true;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startT = Date.now();
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dy = startY - t.clientY;
      const dx = Math.abs(t.clientX - startX);
      if (dx > Math.abs(dy) + 12) return;
      const h = scrollerPageHeight(el);
      const threshold = Math.min(72, Math.max(36, h * 0.12));
      const flick = Date.now() - startT < 320;
      const cur = indexRef.current;
      if (dy > threshold || (flick && dy > 24)) go(cur + 1);
      else if (dy < -threshold || (flick && dy < -24)) go(cur - 1);
      else go(cur);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [embedded, total, stats.period, go]);

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
