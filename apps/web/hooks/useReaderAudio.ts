'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { hapticLight } from '@/lib/haptic';
import {
  bibleAudioStreamUrl,
  clearReaderAudioCheckpoint,
  DEFAULT_READER_AUDIO_SETTINGS,
  fetchBibleAudioChapter,
  fetchBibleAudioTimestamps,
  loadReaderAudioCheckpoint,
  loadReaderAudioSettings,
  markReaderAudioChapterToastSeen,
  markReaderAudioCoachSeen,
  isReaderAudioNetworkAvailable,
  readerAudioChapterToastSeen,
  readerAudioCoachSeen,
  resolveCurrentVerse,
  saveReaderAudioCheckpoint,
  saveReaderAudioSettings,
  type AudioTimestampVerse,
  type BibleAudioChapterMeta,
  type ReaderAudioSettings,
  type ReaderAudioState,
} from '@/lib/reader_audio';

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

let audioGesturePrimed = false;

function configureAudioElement(el: HTMLAudioElement) {
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', 'true');
  (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
}

/** 用户手势内解锁 iOS Audio（仅一次）。 */
function primeAudioElement(el: HTMLAudioElement): void {
  if (audioGesturePrimed) return;
  el.muted = true;
  const unlockSrc = SILENT_WAV;
  el.src = unlockSrc;
  const p = el.play();
  if (!p) {
    el.muted = false;
    audioGesturePrimed = true;
    return;
  }
  void p.catch(() => {}).finally(() => {
    if (el.src === unlockSrc) {
      el.pause();
      el.currentTime = 0;
    }
    el.muted = false;
    audioGesturePrimed = true;
  });
}

function waitForAudioReady(el: HTMLAudioElement, timeoutMs: number): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeEventListener('loadeddata', onReady);
      el.removeEventListener('canplaythrough', onReady);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('error', onError);
      fn();
    };
    const onReady = () => finish(resolve);
    const onError = () => finish(() => reject(new Error('audio_load_failed')));
    const timer = window.setTimeout(
      () => finish(() => reject(new Error('audio_load_timeout'))),
      timeoutMs,
    );
    el.addEventListener('loadeddata', onReady, { once: true });
    el.addEventListener('canplaythrough', onReady, { once: true });
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', onError, { once: true });
  });
}

async function tryStartPlayback(el: HTMLAudioElement): Promise<void> {
  try {
    await el.play();
    return;
  } catch {
    /* 等待缓冲 */
  }
  await waitForAudioReady(el, 45_000);
  await el.play();
}

function streamUrlMatches(el: HTMLAudioElement, streamPath: string): boolean {
  if (!el.src) return false;
  try {
    return el.src.includes(streamPath) || el.src.endsWith(streamPath);
  } catch {
    return false;
  }
}

export function useReaderAudio({
  bookId,
  bookName,
  chapter,
  screenVersion,
  pausedByOverlay,
  onCurrentVerseChange,
}: {
  bookId: string;
  bookName: string;
  chapter: number;
  screenVersion: string;
  pausedByOverlay: boolean;
  onCurrentVerseChange?: (verse: number | null) => void;
}) {
  const toast = useToast();
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const mediaListenersRef = useRef<AbortController | null>(null);
  const metaRef = useRef<BibleAudioChapterMeta | null>(null);
  const timestampsRef = useRef<AudioTimestampVerse[]>([]);
  const chapterRef = useRef(chapter);
  const bookRef = useRef(bookId);
  const manualScrollUntilRef = useRef(0);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedNextRef = useRef<string | null>(null);
  const checkpointSaveRef = useRef(0);
  const uiTickRef = useRef(0);
  const verseTickRef = useRef(0);
  const playingBookRef = useRef('');
  const playingChapterRef = useRef(0);
  const warmupPathRef = useRef('');

  const [state, setState] = useState<ReaderAudioState>('off');
  const [meta, setMeta] = useState<BibleAudioChapterMeta | null>(null);
  const [settings, setSettings] = useState<ReaderAudioSettings>(DEFAULT_READER_AUDIO_SETTINGS);
  const [focusOpen, setFocusOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachVisible, setCoachVisible] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  const [timestamps, setTimestamps] = useState<AudioTimestampVerse[]>([]);

  chapterRef.current = chapter;
  bookRef.current = bookId;

  useEffect(() => {
    const el = document.createElement('audio');
    configureAudioElement(el);
    audioElRef.current = el;
    return () => {
      mediaListenersRef.current?.abort();
      el.pause();
      el.removeAttribute('src');
      el.load();
      audioElRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSettings(loadReaderAudioSettings());
  }, []);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
  }, []);

  const applySleepTimer = useCallback(
    (next: ReaderAudioSettings) => {
      clearSleepTimer();
      if (next.sleepTimer === 'off') return;
      const ms =
        next.sleepTimer === '15'
          ? 15 * 60_000
          : next.sleepTimer === '30'
            ? 30 * 60_000
            : null;
      if (ms != null) {
        sleepTimerRef.current = setTimeout(() => {
          const el = audioElRef.current;
          if (el) el.pause();
          toast('定时停止：朗读已暂停');
        }, ms);
      }
    },
    [clearSleepTimer, toast],
  );

  const persistCheckpoint = useCallback((book: string, ch: number, sec: number, duration?: number) => {
    if (duration != null && duration > 0 && sec >= duration - 5) {
      clearReaderAudioCheckpoint();
      return;
    }
    saveReaderAudioCheckpoint(book, ch, sec);
  }, []);

  const detachAudioListeners = useCallback(() => {
    mediaListenersRef.current?.abort();
    mediaListenersRef.current = null;
  }, []);

  const pauseAndClearElement = useCallback(
    (el: HTMLAudioElement) => {
      detachAudioListeners();
      el.pause();
      el.removeAttribute('src');
      el.load();
      warmupPathRef.current = '';
    },
    [detachAudioListeners],
  );

  const stopInternal = useCallback(() => {
    clearSleepTimer();
    const el = audioElRef.current;
    if (el && playingBookRef.current && playingChapterRef.current > 0) {
      persistCheckpoint(
        playingBookRef.current,
        playingChapterRef.current,
        el.currentTime,
        Number.isFinite(el.duration) ? el.duration : undefined,
      );
    }
    if (el) pauseAndClearElement(el);
    timestampsRef.current = [];
    setTimestamps([]);
    setCurrentVerse(null);
    onCurrentVerseChange?.(null);
    setState('off');
    setCurrentSec(0);
    setDurationSec(0);
    setMinimized(false);
    setFocusOpen(false);
    prefetchedNextRef.current = null;
    playingBookRef.current = '';
    playingChapterRef.current = 0;
  }, [clearSleepTimer, onCurrentVerseChange, pauseAndClearElement, persistCheckpoint]);

  const releasePreviousPlayback = useCallback(() => {
    clearSleepTimer();
    const el = audioElRef.current;
    if (el && playingBookRef.current && playingChapterRef.current > 0) {
      persistCheckpoint(
        playingBookRef.current,
        playingChapterRef.current,
        el.currentTime,
        Number.isFinite(el.duration) ? el.duration : undefined,
      );
    }
    detachAudioListeners();
    if (el) {
      el.pause();
    }
    prefetchedNextRef.current = null;
  }, [clearSleepTimer, detachAudioListeners, persistCheckpoint]);

  const attachMediaSession = useCallback(
    (el: HTMLAudioElement, m: BibleAudioChapterMeta) => {
      if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `${bookName} ${chapter}`,
          artist: m.audio_label || '本章朗读',
          album: '彼爱',
        });
        navigator.mediaSession.setActionHandler('play', () => el.play());
        navigator.mediaSession.setActionHandler('pause', () => el.pause());
      } catch {
        /* ignore */
      }
    },
    [bookName, chapter],
  );

  const loadTimestamps = useCallback(async (m: BibleAudioChapterMeta) => {
    if (!m.has_timestamps || !m.audio_version) {
      timestampsRef.current = [];
      setTimestamps([]);
      return;
    }
    const ts = await fetchBibleAudioTimestamps(m.audio_version, m.book, m.chapter);
    timestampsRef.current = ts.verses || [];
    setTimestamps(ts.verses || []);
  }, []);

  const updateVerseFromTime = useCallback(
    (sec: number) => {
      const verse = resolveCurrentVerse(Math.round(sec * 1000), timestampsRef.current);
      setCurrentVerse(verse);
      onCurrentVerseChange?.(verse);
    },
    [onCurrentVerseChange],
  );

  const prefetchNextChapter = useCallback((m: BibleAudioChapterMeta) => {
    if (!m.audio_version || !m.stream_path) return;
    const key = `${m.book}:${m.chapter + 1}`;
    if (prefetchedNextRef.current === key) return;
    prefetchedNextRef.current = key;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'audio';
    link.href = bibleAudioStreamUrl(
      `/bible/audio/stream/${m.audio_version}/${m.book}/${m.chapter + 1}`,
    );
    document.head.appendChild(link);
  }, []);

  const resolveChapterMeta = useCallback(
    async (targetBook: string, targetChapter: number) => {
      const cached = metaRef.current;
      if (
        cached
        && cached.book === targetBook
        && cached.chapter === targetChapter
        && cached.available !== undefined
      ) {
        return cached;
      }
      const m = await fetchBibleAudioChapter(targetBook, targetChapter, screenVersion);
      metaRef.current = m;
      setMeta(m);
      return m;
    },
    [screenVersion],
  );

  const bindMediaListeners = useCallback(
    (
      el: HTMLAudioElement,
      m: BibleAudioChapterMeta,
      targetBook: string,
      targetChapter: number,
      opts?: { auto?: boolean; skipCheckpoint?: boolean },
    ) => {
      detachAudioListeners();
      const ac = new AbortController();
      mediaListenersRef.current = ac;
      const { signal } = ac;

      const maybeRestoreCheckpoint = () => {
        if (opts?.skipCheckpoint || opts?.auto) return;
        const cp = loadReaderAudioCheckpoint(targetBook, targetChapter);
        if (cp == null || !Number.isFinite(el.duration) || el.duration <= 0) return;
        if (cp >= el.duration - 5) {
          clearReaderAudioCheckpoint();
          return;
        }
        el.currentTime = cp;
        setCurrentSec(cp);
        updateVerseFromTime(cp);
      };

      el.addEventListener('timeupdate', () => {
        const t = el.currentTime;
        const now = Date.now();
        if (now - uiTickRef.current > 250) {
          uiTickRef.current = now;
          setCurrentSec(t);
          if (Number.isFinite(el.duration)) setDurationSec(el.duration);
        }
        if (now - verseTickRef.current > 500) {
          verseTickRef.current = now;
          updateVerseFromTime(t);
        }
        if (el.duration > 0 && t / el.duration > 0.7) prefetchNextChapter(m);
        if (now - checkpointSaveRef.current > 5000) {
          checkpointSaveRef.current = now;
          persistCheckpoint(targetBook, targetChapter, t, el.duration);
        }
      }, { signal });

      el.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(el.duration)) setDurationSec(el.duration);
        maybeRestoreCheckpoint();
      }, { signal });

      el.addEventListener('ended', () => {
        clearReaderAudioCheckpoint();
        if (settings.sleepTimer === 'chapter') {
          stopInternal();
          toast('定时停止：本章朗读结束');
          return;
        }
        if (settings.continuousChapter) {
          toast(`${bookName} ${targetChapter + 1}`);
          void playChapterRef.current?.(targetBook, targetChapter + 1, {
            auto: true,
            skipCheckpoint: true,
          });
        } else {
          stopInternal();
        }
      }, { signal });

      el.addEventListener('pause', () => {
        if (el.ended) return;
        persistCheckpoint(targetBook, targetChapter, el.currentTime, el.duration);
        setState('paused');
      }, { signal });

      el.addEventListener('play', () => {
        hapticLight();
        setState('playing');
      }, { signal });

      el.addEventListener('error', () => {
        setState('error');
      }, { signal });
    },
    [
      bookName,
      detachAudioListeners,
      persistCheckpoint,
      prefetchNextChapter,
      settings.continuousChapter,
      settings.sleepTimer,
      stopInternal,
      toast,
      updateVerseFromTime,
    ],
  );

  const playChapterRef = useRef<
    (targetBook: string, targetChapter: number, opts?: { auto?: boolean; skipCheckpoint?: boolean }) => Promise<void>
  >(() => Promise.resolve());

  const playChapter = useCallback(
    async (
      targetBook: string,
      targetChapter: number,
      opts?: { auto?: boolean; skipCheckpoint?: boolean },
    ) => {
      if (!isReaderAudioNetworkAvailable()) {
        setState('error');
        toast('需要网络加载本章朗读');
        return;
      }

      const el = audioElRef.current;
      if (!el) return;

      if (!opts?.auto) {
        setFocusOpen(true);
        setMinimized(false);
      }
      setState('loading');
      releasePreviousPlayback();
      primeAudioElement(el);

      try {
        const m = await resolveChapterMeta(targetBook, targetChapter);
        if (!m.available || !m.stream_path) {
          if (!opts?.auto) {
            setFocusOpen(false);
            toast('此译本暂无朗读');
          }
          setState('off');
          return;
        }

        playingBookRef.current = targetBook;
        playingChapterRef.current = targetChapter;
        attachMediaSession(el, m);
        applySleepTimer(settings);
        void loadTimestamps(m);
        bindMediaListeners(el, m, targetBook, targetChapter, opts);

        const url = bibleAudioStreamUrl(m.stream_path);
        if (!streamUrlMatches(el, m.stream_path)) {
          el.src = url;
          el.load();
        }
        el.playbackRate = settings.speed;

        await tryStartPlayback(el);
        setState('playing');
        if (!opts?.auto && !readerAudioCoachSeen()) {
          setCoachVisible(true);
          markReaderAudioCoachSeen();
          window.setTimeout(() => setCoachVisible(false), 2500);
        }
      } catch {
        setState('error');
        toast(
          isReaderAudioNetworkAvailable()
            ? '朗读加载失败'
            : '需要网络加载本章朗读',
        );
      }
    },
    [
      applySleepTimer,
      attachMediaSession,
      bindMediaListeners,
      loadTimestamps,
      releasePreviousPlayback,
      resolveChapterMeta,
      settings,
      toast,
    ],
  );

  playChapterRef.current = playChapter;

  /** 用户点击时 meta 已预取：尽量不 await 网络，直接起播。 */
  const playChapterFromGesture = useCallback(
    (targetBook: string, targetChapter: number) => {
      if (!isReaderAudioNetworkAvailable()) {
        setState('error');
        toast('需要网络加载本章朗读');
        return;
      }
      const el = audioElRef.current;
      if (!el) return;

      setFocusOpen(true);
      setMinimized(false);
      setState('loading');
      releasePreviousPlayback();
      primeAudioElement(el);

      const cached = metaRef.current;
      const metaReady =
        cached
        && cached.book === targetBook
        && cached.chapter === targetChapter
        && cached.available !== undefined;

      if (!metaReady) {
        void playChapter(targetBook, targetChapter);
        return;
      }

      if (!cached.available || !cached.stream_path) {
        setState('off');
        setFocusOpen(false);
        toast('此译本暂无朗读');
        return;
      }

      playingBookRef.current = targetBook;
      playingChapterRef.current = targetChapter;
      attachMediaSession(el, cached);
      applySleepTimer(settings);
      void loadTimestamps(cached);
      bindMediaListeners(el, cached, targetBook, targetChapter);

      const url = bibleAudioStreamUrl(cached.stream_path);
      if (!streamUrlMatches(el, cached.stream_path)) {
        el.src = url;
        el.load();
      }
      el.playbackRate = settings.speed;

      void tryStartPlayback(el)
        .then(() => {
          setState('playing');
          if (!readerAudioCoachSeen()) {
            setCoachVisible(true);
            markReaderAudioCoachSeen();
            window.setTimeout(() => setCoachVisible(false), 2500);
          }
        })
        .catch(() => {
          setState('error');
          toast('朗读加载失败');
        });
    },
    [
      applySleepTimer,
      attachMediaSession,
      bindMediaListeners,
      loadTimestamps,
      playChapter,
      releasePreviousPlayback,
      settings,
      toast,
    ],
  );

  const retryPlay = useCallback(() => {
    playChapterFromGesture(bookId, chapter);
  }, [bookId, chapter, playChapterFromGesture]);

  const togglePlay = useCallback(async () => {
    const el = audioElRef.current;
    if (state === 'playing' && el) {
      hapticLight();
      el.pause();
      return;
    }
    if (state === 'paused' && el) {
      hapticLight();
      primeAudioElement(el);
      try {
        await el.play();
      } catch {
        try {
          await tryStartPlayback(el);
        } catch {
          setState('error');
          toast('朗读加载失败');
        }
      }
      return;
    }
    if (state === 'error' && el?.src) {
      setState('loading');
      setFocusOpen(true);
      setMinimized(false);
      primeAudioElement(el);
      try {
        await tryStartPlayback(el);
        setState('playing');
      } catch {
        setState('error');
        toast('朗读加载失败');
      }
      return;
    }
    playChapterFromGesture(bookId, chapter);
  }, [bookId, chapter, playChapterFromGesture, state, toast]);

  const seekTo = useCallback(
    (sec: number) => {
      const el = audioElRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(sec, el.duration || sec));
      updateVerseFromTime(el.currentTime);
    },
    [updateVerseFromTime],
  );

  const updateSettings = useCallback(
    (patch: Partial<ReaderAudioSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveReaderAudioSettings(next);
        const el = audioElRef.current;
        if (el && patch.speed != null) el.playbackRate = patch.speed;
        applySleepTimer(next);
        return next;
      });
    },
    [applySleepTimer],
  );

  const notifyManualScroll = useCallback(() => {
    manualScrollUntilRef.current = Date.now() + 8000;
  }, []);

  useEffect(() => {
    if (!pausedByOverlay) return;
    const el = audioElRef.current;
    if (el && !el.paused) el.pause();
  }, [pausedByOverlay]);

  useEffect(() => {
    const el = audioElRef.current;
    const active = state === 'playing' || state === 'paused' || state === 'loading';
    if (!active || !el) return;
    if (bookRef.current === bookId && chapterRef.current === chapter) return;

    if (settings.continueOnChapterSwipe && state === 'playing') {
      void playChapter(bookId, chapter, { auto: true, skipCheckpoint: true });
      if (!readerAudioChapterToastSeen()) {
        markReaderAudioChapterToastSeen();
        toast(`${bookName} ${chapter}`);
      }
    } else {
      stopInternal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, chapter]);

  useEffect(() => {
    const el = audioElRef.current;
    if (el) el.playbackRate = settings.speed;
  }, [settings.speed]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (settings.backgroundPlay) return;
      const el = audioElRef.current;
      if (el && !el.paused) el.pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [settings.backgroundPlay]);

  useEffect(
    () => () => {
      stopInternal();
    },
    [stopInternal],
  );

  useEffect(() => {
    if (!currentVerse || state !== 'playing') return;
    if (Date.now() < manualScrollUntilRef.current) return;
    const anchor = document.getElementById(`verse-anchor-${currentVerse}`);
    anchor?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentVerse, state]);

  useEffect(() => {
    let cancelled = false;
    void fetchBibleAudioChapter(bookId, chapter, screenVersion).then((m) => {
      if (!cancelled) {
        metaRef.current = m;
        setMeta(m);
      }
    }).catch(() => {
      if (!cancelled) {
        const fallback = { available: false, book: bookId, chapter };
        metaRef.current = fallback;
        setMeta(fallback);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter, screenVersion]);

  /** 进入章节后预加载音频 URL，点击时可直接 play()。 */
  useEffect(() => {
    const el = audioElRef.current;
    const m = metaRef.current;
    if (!el || !m?.available || !m.stream_path) return;
    if (m.book !== bookId || m.chapter !== chapter) return;
    if (state === 'playing' || state === 'paused' || state === 'loading') return;
    if (warmupPathRef.current === m.stream_path) return;

    warmupPathRef.current = m.stream_path;
    const url = bibleAudioStreamUrl(m.stream_path);
    if (!streamUrlMatches(el, m.stream_path)) {
      el.src = url;
      el.load();
    }
  }, [meta, bookId, chapter, state]);

  return {
    state,
    meta,
    timestamps,
    currentVerse,
    unavailable: meta ? !meta.available : false,
    settings,
    focusOpen,
    setFocusOpen,
    settingsOpen,
    setSettingsOpen,
    coachVisible,
    collapsed,
    setCollapsed,
    minimized,
    setMinimized,
    currentSec,
    durationSec,
    currentLabel: `${bookName} ${chapter}${meta?.audio_label ? ` · ${meta.audio_label}` : ''}`,
    formatTime,
    togglePlay,
    stop: stopInternal,
    seekTo,
    retryPlay,
    updateSettings,
    playChapter,
    openSettings: () => setSettingsOpen(true),
    notifyManualScroll,
  };
}
