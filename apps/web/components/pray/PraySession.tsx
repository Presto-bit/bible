'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  PRAY_AMBIENT_TRACKS,
  prayAmbientById,
  readPrayAmbientMuted,
  readPrayAmbientTrackId,
  writePrayAmbientMuted,
  writePrayAmbientTrackId,
} from '@/lib/pray_ambient';
import { prayMomentForToday } from '@/lib/pray_moments';
import { logPrayer } from '@/lib/reading';
import { useToast } from '@/components/ui/ToastProvider';
import { applyAppTheme } from '@/lib/app_theme';

/** 与 .pray-session 底色一致，避免 PWA 状态栏 / 过滚露出壳层白底 */
const PRAY_SURFACE = '#f3ebe3';

/**
 * 全屏沉浸祷告：短文案 + 背景音乐 loop。
 * Portal 到 body，盖住 Tab / 离线条等壳层，适配 standalone PWA。
 */
export default function PraySession() {
  const router = useRouter();
  const toast = useToast();
  const moment = useMemo(() => prayMomentForToday(), []);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [trackId, setTrackId] = useState(PRAY_AMBIENT_TRACKS[0]!.id);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needGesture, setNeedGesture] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [done, setDone] = useState(false);

  const track = prayAmbientById(trackId);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setTrackId(readPrayAmbientTrackId());
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

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        audioRef.current?.pause();
        router.push('/');
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.documentElement.classList.remove('pray-session-open');
      document.body.classList.remove('pray-session-open');
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBodyBg;
      document.documentElement.style.background = prevHtmlBg;
      if (prevTheme) meta?.setAttribute('content', prevTheme);
      else applyAppTheme();
      window.removeEventListener('keydown', onKey);
    };
  }, [router]);

  const tryPlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el || muted) {
      setPlaying(false);
      return;
    }
    try {
      el.volume = 0.55;
      await el.play();
      setPlaying(true);
      setNeedGesture(false);
    } catch {
      setPlaying(false);
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
      setPlaying(false);
      return;
    }
    void tryPlay();
  }, [track.src, muted, tryPlay]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    writePrayAmbientMuted(next);
    if (next) {
      audioRef.current?.pause();
      setPlaying(false);
    } else {
      void tryPlay();
    }
  };

  const selectTrack = (id: string) => {
    setTrackId(id);
    writePrayAmbientTrackId(id);
    setPickerOpen(false);
  };

  const leave = useCallback(() => {
    audioRef.current?.pause();
    router.push('/');
  }, [router]);

  const onAmen = () => {
    if (done) {
      leave();
      return;
    }
    logPrayer();
    setDone(true);
    toast('已记录今日祷告');
    audioRef.current?.pause();
    setPlaying(false);
  };

  if (!mounted) return null;

  return createPortal(
    <div className="pray-session" role="dialog" aria-modal="true" aria-label="今日祷告">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="auto" playsInline />

      <div className="pray-session-bg" aria-hidden />
      <div className="pray-session-glow" aria-hidden />

      <header className="pray-session-top">
        <button type="button" className="pray-session-close" onClick={leave} aria-label="关闭">
          关闭
        </button>
        <div className="pray-session-audio-bar">
          <button
            type="button"
            className="pray-session-audio-btn"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? '打开音乐' : '静音'}
          >
            {muted ? '静音' : playing ? '乐响' : '音乐'}
          </button>
          <button
            type="button"
            className="pray-session-audio-btn"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
          >
            {track.title}
          </button>
        </div>
      </header>

      {pickerOpen ? (
        <div className="pray-session-picker" role="listbox" aria-label="选择背景音乐">
          {PRAY_AMBIENT_TRACKS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === trackId}
              className={[
                'pray-session-picker-item',
                t.id === trackId ? 'is-on' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => selectTrack(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
      ) : null}

      {needGesture && !muted ? (
        <button type="button" className="pray-session-gesture" onClick={() => void tryPlay()}>
          轻触开启背景音乐
        </button>
      ) : null}

      <div className="pray-session-body">
        <p className="pray-session-kicker">{moment.kicker}</p>
        <p className="pray-session-text">{moment.body}</p>
        <p className="pray-session-hint">可以闭目安静一会儿</p>
      </div>

      <footer className="pray-session-foot">
        <button type="button" className="pray-session-amen" onClick={onAmen}>
          {done ? '回到首页' : moment.amen || '阿们'}
        </button>
      </footer>
    </div>,
    document.body,
  );
}
