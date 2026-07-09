'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pickDailyTopicSlide, type TopicSlide } from '@/lib/home_daily_carousel';
import { chinaTodayYmd, watchChinaDayChange } from '@/lib/daily_clock';
import { dailyQuizProgress } from '@/lib/daily_quiz';

type Slide = {
  id: string;
  href: string;
  kicker: string;
  title: string;
  sub: string;
  cta: string;
  theme: 'quiz' | 'diagram' | 'map' | 'timeline' | 'graph';
  done?: boolean;
};

function topicTheme(kind: TopicSlide['kind']): Slide['theme'] {
  return kind;
}

function buildSlides(): Slide[] {
  const quiz = dailyQuizProgress(5);
  const topic = pickDailyTopicSlide(chinaTodayYmd());

  const quizSlide: Slide = quiz.done
    ? {
        id: 'quiz',
        href: '/challenge',
        kicker: '每日一题 ✓',
        title: '今日 5 题已完成',
        sub: '明日再来 · 查看解析',
        cta: '查看解析',
        theme: 'quiz',
        done: true,
      }
    : {
        id: 'quiz',
        href: '/challenge',
        kicker: `每日一题 · ${Math.min(quiz.answered + 1, quiz.total)}/${quiz.total}`,
        title: quiz.current?.question ?? '今日知识问答',
        sub: quiz.current?.theme ?? '开始今日闯关',
        cta: quiz.answered > 0 ? '继续答题' : '去答题',
        theme: 'quiz',
      };

  const topicSlide: Slide = {
    id: `topic-${topic.id}`,
    href: topic.href,
    kicker: topic.badge,
    title: topic.title,
    sub: topic.subtitle,
    cta: '开始游览',
    theme: topicTheme(topic.kind),
  };

  return [quizSlide, topicSlide];
}

export function HomeDailyCarousel() {
  const [slides, setSlides] = useState<Slide[]>(() => buildSlides());
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const refresh = useCallback(() => {
    setSlides(buildSlides());
  }, []);

  useEffect(() => {
    refresh();
    return watchChinaDayChange(refresh);
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        let best = -1;
        let bestRatio = 0;
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.slideIdx);
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio;
            best = idx;
          }
        }
        if (best >= 0) setActiveIdx(best);
      },
      { root, threshold: [0.55, 0.7, 0.85] },
    );
    for (const el of root.querySelectorAll('[data-slide-idx]')) obs.observe(el);
    return () => obs.disconnect();
  }, [slides.length]);

  const dots = useMemo(() => slides.map((_, i) => i), [slides.length]);

  return (
    <section className="home-daily-carousel" aria-label="今日推荐">
      <div className="home-admin-preview-tag" aria-hidden>管理员预览</div>
      <div ref={trackRef} className="home-daily-carousel-track">
        {slides.map((slide, idx) => (
          <Link
            key={slide.id}
            href={slide.href}
            data-slide-idx={idx}
            className={`card hero-verse hero-verse-compact hero-verse-compact-${slide.theme}${slide.done ? ' hero-verse-compact-done' : ''}`}
          >
            <div className="hero-scene" aria-hidden />
            <div className="hero-inner hero-inner-split">
              <span className="hero-kicker hero-kicker-corner">{slide.kicker}</span>
              <div className="hero-main home-daily-carousel-main">
                <p className="home-daily-carousel-title">{slide.title}</p>
                <p className="muted home-daily-carousel-sub">{slide.sub}</p>
              </div>
              <span className="home-daily-carousel-cta">{slide.cta} ›</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="home-daily-carousel-dots" role="tablist" aria-label="今日推荐分页">
        {dots.map((i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={activeIdx === i}
            aria-label={`第 ${i + 1} 项`}
            className={`home-daily-carousel-dot${activeIdx === i ? ' is-active' : ''}`}
            onClick={() => {
              const el = trackRef.current?.querySelector<HTMLElement>(`[data-slide-idx="${i}"]`);
              el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
          />
        ))}
      </div>
    </section>
  );
}
