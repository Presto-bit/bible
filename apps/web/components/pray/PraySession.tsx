'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  pickRandomPrayAmbientTrack,
  readPrayAmbientMuted,
  writePrayAmbientMuted,
  type PrayAmbientTrack,
} from '@/lib/pray_ambient';
import { prayFlowForToday } from '@/lib/pray_flow';
import { logPrayer } from '@/lib/reading';
import { useToast } from '@/components/ui/ToastProvider';
import { applyAppTheme } from '@/lib/app_theme';

const PRAY_SURFACE = '#f3ebe3';

function MuteIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M5 10v4h3l4 3V7l-4 3H5z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M16 9.5l4 5M20 9.5l-4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 10v4h3l4 3V7l-4 3H5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 8.5a4.5 4.5 0 010 7M18.8 6.2a7.5 7.5 0 010 11.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 全屏沉浸祷告：对话式流程 + 短经文 + 背景音乐。
 * 左右滑切换；按时自动推进；结束后完成态，音乐继续，点关闭退出。
 */
export default function PraySession() {
  const router = useRouter();
  const toast = useToast();
  const flow = useMemo(() => prayFlowForToday(), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const loggedRef = useRef(false);
  const autoPausedRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [track] = useState<PrayAmbientTrack>(() => pickRandomPrayAmbientTrack());
  const [muted, setMuted] = useState(false);
  const [needGesture, setNeedGesture] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);

  const steps = flow.steps;
  const step = steps[stepIndex];
  const isLastStep = stepIndex >= steps.length - 1;

  useEffect(() => {
    setMounted(true);
    setMuted(readPrayAmbientMuted());
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBodyBg = document.body.style.background;
    const prevHtmlBg = document.documentElement.style.background;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute('content') ?? '';

    document.documentElement.classList.add('pray-session-open');
    document.body.classList.add('pray-session-open');
    document.body.style.overflow = 'hidden';
    document.body.style.background = PRAY_SURFACE;
    document.documentElement.style.background = PRAY_SURFACE;
    meta?.setAttribute('content', PRAY_SURFACE);

    return () => {
      document.documentElement.classList.remove('pray-session-open');
      document.body.classList.remove('pray-session-open');
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
      if (prevTheme) meta?.setAttribute('content', prevTheme);
      else applyAppTheme();
    };
  }, []);

  const tryPlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el || muted) return;
    try {
      el.volume = 0.45;
      await el.play();
      setNeedGesture(false);
    } catch {
      setNeedGesture(true);
    }
  }, [muted]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.loop = true;
    el.src = track.src;
    el.load();
    if (muted) {
      el.pause();
      return;
    }
    void tryPlay();
  }, [track.src, muted, tryPlay]);

  const markComplete = useCallback(() => {
    setCompleted(true);
    if (!loggedRef.current) {
      loggedRef.current = true;
      logPrayer();
      toast('今日祷告已完成');
    }
  }, [toast]);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= steps.length) {
        markComplete();
        return;
      }
      setStepIndex(next);
      autoPausedRef.current = false;
    },
    [markComplete, steps.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        audioRef.current?.pause();
        router.push('/');
        return;
      }
      if (completed) return;
      if (e.key === 'ArrowLeft') goTo(stepIndex - 1);
      if (e.key === 'ArrowRight') goTo(stepIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, goTo, stepIndex, completed]);

  useEffect(() => {
    if (completed || !step) return;
    const duration = Math.max(3000, step.durationMs);
    const started = Date.now();
    const tick = window.setInterval(() => {
      if (autoPausedRef.current) return;
      if (Date.now() - started < duration) return;
      window.clearInterval(tick);
      if (isLastStep) markComplete();
      else goTo(stepIndex + 1);
    }, 200);
    return () => window.clearInterval(tick);
  }, [completed, step, stepIndex, isLastStep, goTo, markComplete]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writePrayAmbientMuted(next);
    if (next) {
      audioRef.current?.pause();
    } else {
      void tryPlay();
    }
  };

  const leave = useCallback(() => {
    audioRef.current?.pause();
    router.push('/');
  }, [router]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    autoPausedRef.current = true;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    autoPausedRef.current = false;
    if (start == null || completed) return;
    const end = e.changedTouches[0]?.clientX ?? start;
    const dx = end - start;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) goTo(stepIndex + 1);
    else goTo(stepIndex - 1);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={['pray-session', completed ? 'is-complete' : ''].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="今日祷告"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="auto" playsInline />

      <div className="pray-session-bg" aria-hidden />
      <div className="pray-session-glow" aria-hidden />

      <header className="pray-session-top">
        <button type="button" className="pray-session-close" onClick={leave} aria-label="关闭">
          关闭
        </button>
        <button
          type="button"
          className="pray-session-mute"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? '打开音乐' : '静音'}
          title={muted ? '打开音乐' : '静音'}
        >
          <MuteIcon muted={muted} />
        </button>
      </header>

      {needGesture && !muted ? (
        <button type="button" className="pray-session-gesture" onClick={() => void tryPlay()}>
          轻触开启背景音乐
        </button>
      ) : null}

      <div className="pray-session-body">
        {completed ? (
          <p className="pray-session-text">今日祷告已完成。你可以继续安静一会儿，或关闭离开。</p>
        ) : (
          <div className="pray-session-step" key={step?.id}>
            <p className="pray-session-text">{step?.text}</p>
            {step?.verse ? (
              <blockquote className="pray-session-verse">
                <p className="pray-session-verse-text">「{step.verse.text}」</p>
                <cite className="pray-session-verse-ref">{step.verse.ref}</cite>
              </blockquote>
            ) : null}
          </div>
        )}
      </div>

      <footer className="pray-session-foot">
        {completed ? (
          <button type="button" className="pray-session-amen" onClick={leave}>
            关闭
          </button>
        ) : (
          <button
            type="button"
            className="pray-session-amen pray-session-amen-ghost"
            onClick={() => goTo(stepIndex + 1)}
          >
            {isLastStep ? '完成' : '下一步'}
          </button>
        )}
      </footer>
    </div>,
    document.body,
  );
}
