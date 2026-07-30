'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { HeroBCampaign } from '@/lib/hero_b_campaign';
import { heroBCampaignImageSrc } from '@/lib/hero_b_campaign';
import { markHeroReturnToVerse } from '@/lib/hero_b_nav';

const ROTATE_MS = 9000;
const SWIPE_THRESHOLD_PX = 48;

type Props = {
  verseSlide: ReactNode;
  campaign: HeroBCampaign | null;
  campaignReady: boolean;
  resetToVerseNonce?: number;
  bootstrapReady: boolean;
};

export function HomeHeroCarousel({
  verseSlide,
  campaign,
  campaignReady,
  resetToVerseNonce = 0,
  bootstrapReady,
}: Props) {
  const router = useRouter();
  const hasOps = Boolean(campaign && campaignReady);
  const [slide, setSlide] = useState(0);
  const slideRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number; dragging: boolean } | null>(
    null,
  );
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    clearTimer();
    if (!hasOps || !bootstrapReady) return;
    timerRef.current = setTimeout(() => {
      setSlide((prev) => {
        const next = prev === 0 ? 1 : 0;
        slideRef.current = next;
        return next;
      });
      scheduleNext();
    }, ROTATE_MS);
  }, [bootstrapReady, clearTimer, hasOps]);

  const goSlide = useCallback(
    (idx: number) => {
      const clamped = hasOps ? Math.max(0, Math.min(1, idx)) : 0;
      slideRef.current = clamped;
      setSlide(clamped);
      scheduleNext();
    },
    [hasOps, scheduleNext],
  );

  useEffect(() => {
    if (resetToVerseNonce > 0) goSlide(0);
  }, [resetToVerseNonce, goSlide]);

  useEffect(() => {
    if (!hasOps) {
      clearTimer();
      goSlide(0);
      return;
    }
    if (bootstrapReady) scheduleNext();
    return clearTimer;
  }, [bootstrapReady, clearTimer, goSlide, hasOps, scheduleNext]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !hasOps) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchRef.current = { x: t.clientX, y: t.clientY, dragging: false };
      clearTimer();
    };
    const onTouchMove = (e: TouchEvent) => {
      const start = touchRef.current;
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!start.dragging) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          touchRef.current = null;
          setDragX(0);
          setDragging(false);
          return;
        }
        start.dragging = true;
        setDragging(true);
      }
      const width = track.clientWidth || 1;
      // 边界阻尼
      let limited = dx;
      if (slideRef.current === 0 && dx > 0) limited = dx * 0.35;
      if (slideRef.current === 1 && dx < 0) limited = dx * 0.35;
      setDragX(Math.max(-width * 0.45, Math.min(width * 0.45, limited)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      const start = touchRef.current;
      touchRef.current = null;
      setDragging(false);
      setDragX(0);
      if (!start) {
        scheduleNext();
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) {
        scheduleNext();
        return;
      }
      if (dx < 0) goSlide(slideRef.current + 1);
      else goSlide(slideRef.current - 1);
    };

    track.addEventListener('touchstart', onTouchStart, { passive: true });
    track.addEventListener('touchmove', onTouchMove, { passive: true });
    track.addEventListener('touchend', onTouchEnd, { passive: true });
    track.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      track.removeEventListener('touchstart', onTouchStart);
      track.removeEventListener('touchmove', onTouchMove);
      track.removeEventListener('touchend', onTouchEnd);
      track.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [clearTimer, goSlide, hasOps, scheduleNext]);

  if (!hasOps) {
    return <section className="home-hero-block">{verseSlide}</section>;
  }

  const imgSrc = campaign ? heroBCampaignImageSrc(campaign) : '';

  return (
    <section className="home-hero-block home-hero-carousel" aria-label="每日经文与活动推荐">
      <div className="home-hero-carousel-dots" role="tablist" aria-label="首页推荐分页">
        <button
          type="button"
          role="tab"
          aria-selected={slide === 0}
          aria-label="每日经文"
          className={`home-hero-carousel-dot${slide === 0 ? ' is-active' : ''}`}
          onClick={() => goSlide(0)}
        >
          经文
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={slide === 1}
          aria-label="活动推荐"
          className={`home-hero-carousel-dot${slide === 1 ? ' is-active' : ''}`}
          onClick={() => goSlide(1)}
        >
          活动
        </button>
      </div>
      <div
        ref={trackRef}
        className={`home-hero-carousel-track${dragging ? ' is-dragging' : ''}`}
        style={{
          transform: `translateX(calc(-${slide * 100}% + ${dragX}px))`,
        }}
      >
        <div className="home-hero-carousel-slide">{verseSlide}</div>
        <div className="home-hero-carousel-slide">
          <button
            type="button"
            className="hero-b-campaign card card-3"
            aria-label={campaign!.alt}
            onClick={() => {
              markHeroReturnToVerse();
              router.push(campaign!.href);
            }}
          >
            {campaign!.badge ? (
              <span className="hero-b-campaign-badge">{campaign!.badge}</span>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hero-b-campaign-img"
              src={imgSrc}
              alt={campaign!.alt}
              draggable={false}
            />
          </button>
        </div>
      </div>
    </section>
  );
}
