'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureListenChapter,
  fetchListenChapter,
  LISTEN_DEFAULT_VOICE,
  LISTEN_VOICES,
  pollListenJob,
  resolveListenVerse,
  type ListenChapterReady,
  type ListenTimelineItem,
} from '@/lib/listen_api';

export type BibleListenUiState = 'idle' | 'preparing' | 'playing' | 'paused' | 'error';

export type BibleListenSettings = {
  speed: number;
  continuousChapter: boolean;
  sleepMinutes: number | null;
  voice: string;
};

const SETTINGS_KEY = 'bible_listen_settings_v1';
const TIP_KEY = 'bible_listen_tip_v1';
const SPEEDS = [0.8, 1, 1.25, 1.5] as const;

function loadSettings(): BibleListenSettings {
  if (typeof window === 'undefined') {
    return { speed: 1, continuousChapter: true, sleepMinutes: null, voice: LISTEN_DEFAULT_VOICE };
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { speed: 1, continuousChapter: true, sleepMinutes: null, voice: LISTEN_DEFAULT_VOICE };
    }
    const j = JSON.parse(raw) as Partial<BibleListenSettings>;
    const voice =
      typeof j.voice === 'string' && LISTEN_VOICES.some((v) => v.id === j.voice)
        ? j.voice
        : LISTEN_DEFAULT_VOICE;
    return {
      speed: typeof j.speed === 'number' ? j.speed : 1,
      continuousChapter: true,
      sleepMinutes: typeof j.sleepMinutes === 'number' ? j.sleepMinutes : null,
      voice,
    };
  } catch {
    return { speed: 1, continuousChapter: true, sleepMinutes: null, voice: LISTEN_DEFAULT_VOICE };
  }
}

function saveSettings(s: BibleListenSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function useBibleListen(opts: {
  bookId: string;
  bookName: string;
  chapter: number;
  translation: string;
  translationLabel: string;
  verses: { verse: number; text: string }[];
  onRequestNavigateChapter?: (book: string, chapter: number) => void;
  onFirstListenTip?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [ui, setUi] = useState<BibleListenUiState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  const [settings, setSettingsState] = useState<BibleListenSettings>(loadSettings);
  const [meta, setMeta] = useState<ListenChapterReady | null>(null);
  const [hasTimeline, setHasTimeline] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineRef = useRef<ListenTimelineItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const sleepFadeRafRef = useRef<number | null>(null);
  const [sleepClosing, setSleepClosing] = useState(false);
  const continuousRef = useRef(settings.continuousChapter);
  const metaRef = useRef<ListenChapterReady | null>(null);
  const preparingRef = useRef(false);
  const prefetchRef = useRef<string | null>(null);
  /** 章末续听等「听读驱动」换章：允许关面也跟听；首页/阅读自行换章则不跟。 */
  const followChapterRef = useRef(false);
  const optsRef = useRef(opts);
  const settingsRef = useRef(settings);
  optsRef.current = opts;
  settingsRef.current = settings;

  continuousRef.current = settings.continuousChapter;
  metaRef.current = meta;

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audioRef.current = el;
    }
    return audioRef.current;
  }, []);

  useEffect(() => {
    const el = ensureAudio();
    const onTime = () => {
      const ms = (el.currentTime || 0) * 1000;
      setCurrentSec(el.currentTime || 0);
      setCurrentVerse(resolveListenVerse(timelineRef.current, ms));
      const m = metaRef.current;
      if (
        continuousRef.current &&
        m?.next &&
        el.duration > 0 &&
        el.currentTime / el.duration >= 0.7
      ) {
        const key = `${m.translation}:${m.next.book}:${m.next.chapter}`;
        if (prefetchRef.current !== key) {
          prefetchRef.current = key;
          void fetchListenChapter({
            translation: m.translation,
            book: m.next.book,
            chapter: m.next.chapter,
            voice: settingsRef.current.voice,
          })
            .then(async (first) => {
              if (first.status === 'pending') {
                try {
                  await pollListenJob(first.job_id, { timeoutMs: 180_000 });
                } catch {
                  /* ignore prefetch errors */
                }
              }
            })
            .catch(() => {
              /* ignore */
            });
        }
      }
    };
    const onMeta = () => setDurationSec(el.duration || 0);
    const onPlay = () => setUi('playing');
    const onPause = () => {
      if (!preparingRef.current) setUi((u) => (u === 'preparing' ? u : 'paused'));
    };
    const onEnded = () => {
      const m = metaRef.current;
      if (continuousRef.current && m?.next && optsRef.current.onRequestNavigateChapter) {
        followChapterRef.current = true;
        optsRef.current.onRequestNavigateChapter(m.next.book, m.next.chapter);
        return;
      }
      setUi('paused');
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
    };
  }, [ensureAudio]);

  useEffect(() => {
    const el = ensureAudio();
    el.playbackRate = settings.speed;
  }, [settings.speed, ensureAudio]);

  const updateSettings = useCallback((patch: Partial<BibleListenSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      settingsRef.current = next;
      saveSettings(next);
      return next;
    });
  }, []);

  const restoreVolume = useCallback(() => {
    const el = audioRef.current;
    if (el) el.volume = 1;
  }, []);

  const clearSleep = useCallback(() => {
    if (sleepTimerRef.current) {
      window.clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (sleepFadeRafRef.current != null) {
      window.cancelAnimationFrame(sleepFadeRafRef.current);
      sleepFadeRafRef.current = null;
    }
    setSleepClosing(false);
    restoreVolume();
  }, [restoreVolume]);

  const armSleep = useCallback(
    (minutes: number | null) => {
      clearSleep();
      updateSettings({ sleepMinutes: minutes });
      if (!minutes || minutes <= 0) return;
      const totalMs = minutes * 60_000;
      const fadeMs = Math.min(30_000, totalMs);
      const fadeStartMs = Math.max(0, totalMs - fadeMs);
      sleepTimerRef.current = window.setTimeout(() => {
        setSleepClosing(true);
        const el = audioRef.current;
        const startVol = el && el.volume > 0 ? el.volume : 1;
        const startedAt = performance.now();
        const tick = (now: number) => {
          const audio = audioRef.current;
          const t = Math.min(1, (now - startedAt) / fadeMs);
          if (audio) audio.volume = startVol * (1 - t);
          if (t >= 1) {
            sleepFadeRafRef.current = null;
            if (audio) {
              audio.pause();
              audio.volume = startVol;
            }
            setUi('paused');
            setSleepClosing(false);
            updateSettings({ sleepMinutes: null });
            return;
          }
          sleepFadeRafRef.current = window.requestAnimationFrame(tick);
        };
        sleepFadeRafRef.current = window.requestAnimationFrame(tick);
      }, fadeStartMs);
    },
    [clearSleep, updateSettings],
  );

  const stopSession = useCallback(() => {
    abortRef.current?.abort();
    preparingRef.current = false;
    clearSleep();
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      el.volume = 1;
    }
    timelineRef.current = [];
    setHasTimeline(false);
    setMeta(null);
    setCurrentSec(0);
    setDurationSec(0);
    setCurrentVerse(null);
    setUi('idle');
    setError(null);
  }, [clearSleep]);

  const prepareAndPlay = useCallback(
    async (book: string, chapter: number, translation: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      preparingRef.current = true;
      setUi('preparing');
      setError(null);
      try {
        const ready = await ensureListenChapter(
          {
            translation,
            book,
            chapter,
            voice: settingsRef.current.voice,
          },
          { signal: ac.signal },
        );
        if (ac.signal.aborted) return;
        setMeta(ready);
        timelineRef.current = ready.timeline || [];
        setHasTimeline((ready.timeline || []).length > 0);
        const el = ensureAudio();
        el.src = ready.url;
        el.playbackRate = settings.speed;
        setDurationSec((ready.duration_ms || 0) / 1000);
        try {
          await el.play();
        } catch (playErr) {
          preparingRef.current = false;
          setUi('error');
          setError(
            playErr instanceof Error && playErr.name === 'NotAllowedError'
              ? '请点播放键开始听读'
              : playErr instanceof Error
                ? playErr.message
                : '播放失败',
          );
          return;
        }
        preparingRef.current = false;
        setUi('playing');
        if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: `${ready.book_name} ${ready.chapter}`,
              artist: ready.translation_label || '彼爱听读',
            });
            navigator.mediaSession.setActionHandler('play', () => void el.play());
            navigator.mediaSession.setActionHandler('pause', () => el.pause());
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        preparingRef.current = false;
        setUi('error');
        setError(e instanceof Error ? e.message : '准备失败');
      }
    },
    [ensureAudio, settings.speed],
  );

  const selectVoice = useCallback(
    (voice: string) => {
      if (!LISTEN_VOICES.some((v) => v.id === voice)) return;
      const next = { ...settingsRef.current, voice };
      settingsRef.current = next;
      saveSettings(next);
      setSettingsState(next);
      if (ui !== 'idle') {
        void prepareAndPlay(optsRef.current.bookId, optsRef.current.chapter, optsRef.current.translation);
      }
    },
    [prepareAndPlay, ui],
  );

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    try {
      if (!localStorage.getItem(TIP_KEY)) {
        localStorage.setItem(TIP_KEY, '1');
        optsRef.current.onFirstListenTip?.();
      }
    } catch {
      /* ignore */
    }
    const same =
      meta &&
      meta.book === opts.bookId &&
      meta.chapter === opts.chapter &&
      meta.translation === opts.translation &&
      meta.voice === settings.voice;
    const el = audioRef.current;
    if (same && el?.src && !el.paused) {
      setUi('playing');
      return;
    }
    if (same && el?.src && el.paused && ui !== 'error' && ui !== 'idle') {
      setUi('paused');
      return;
    }
    void prepareAndPlay(opts.bookId, opts.chapter, opts.translation);
  }, [meta, opts.bookId, opts.chapter, opts.translation, settings.voice, prepareAndPlay, ui]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    // 尚未出声：取消准备；已出声：只关面
    if (preparingRef.current) {
      const el = audioRef.current;
      const started = Boolean(el && !el.paused && el.currentTime > 0.05);
      if (!started) {
        abortRef.current?.abort();
        preparingRef.current = false;
        setUi('idle');
      }
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const el = ensureAudio();
    if (ui === 'preparing') return;
    if (ui === 'error' || ui === 'idle') {
      void prepareAndPlay(opts.bookId, opts.chapter, opts.translation);
      return;
    }
    if (el.paused) void el.play();
    else el.pause();
  }, [ensureAudio, ui, prepareAndPlay, opts.bookId, opts.chapter, opts.translation]);

  const seekMs = useCallback(
    (ms: number) => {
      const el = ensureAudio();
      if (!timelineRef.current.length) return;
      el.currentTime = Math.max(0, ms / 1000);
      setCurrentSec(el.currentTime);
      setCurrentVerse(resolveListenVerse(timelineRef.current, ms));
    },
    [ensureAudio],
  );

  const seekVerse = useCallback(
    (verse: number) => {
      const hit = timelineRef.current.find((t) => t.verse === verse);
      if (hit) seekMs(hit.start_ms);
    },
    [seekMs],
  );

  const stepVerse = useCallback(
    (dir: -1 | 1) => {
      const list = timelineRef.current;
      if (!list.length) return;
      const cur = currentVerse ?? list[0].verse;
      const idx = list.findIndex((t) => t.verse === cur);
      const next = list[Math.max(0, idx) + dir];
      if (next) seekMs(next.start_ms);
    },
    [currentVerse, seekMs],
  );

  useEffect(() => {
    return () => {
      if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current);
      if (sleepFadeRafRef.current != null) {
        window.cancelAnimationFrame(sleepFadeRafRef.current);
      }
    };
  }, []);

  // 换章：仅听读面内 / 章末续听跟听；首页·阅读自行换章则结束听读（避免每日经文误触发）
  useEffect(() => {
    if (!meta) return;
    if (meta.book === opts.bookId && meta.chapter === opts.chapter) return;
    if (meta.translation !== opts.translation) return;
    const follow = sheetOpen || followChapterRef.current;
    followChapterRef.current = false;
    if (follow) {
      void prepareAndPlay(opts.bookId, opts.chapter, opts.translation);
      return;
    }
    if (ui === 'playing' || ui === 'paused' || ui === 'preparing') {
      stopSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.bookId, opts.chapter]);

  // 听中切主译本：结束会话
  useEffect(() => {
    if (!meta) return;
    if (meta.translation === opts.translation) return;
    if (ui === 'idle') return;
    stopSession();
    setSheetOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.translation]);

  const verseText =
    (currentVerse != null
      ? opts.verses.find((v) => v.verse === currentVerse)?.text
      : opts.verses[0]?.text) || '';

  return {
    sheetOpen,
    openSheet,
    closeSheet,
    ui,
    error,
    currentSec,
    durationSec,
    currentVerse,
    verseText,
    meta,
    settings,
    speeds: SPEEDS,
    updateSettings,
    selectVoice,
    voices: LISTEN_VOICES,
    armSleep,
    sleepClosing,
    togglePlayPause,
    seekMs,
    seekVerse,
    stepVerse,
    stopSession,
    formatTime,
    canSeek: hasTimeline,
    sessionActive: ui === 'playing' || ui === 'paused' || ui === 'preparing',
  };
}
