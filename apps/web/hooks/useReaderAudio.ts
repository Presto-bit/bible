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

/** iOS：在用户手势栈内解锁 Audio，避免 await 后 play() 被拦。 */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

function primeAudioElement(el: HTMLAudioElement): void {
  el.muted = true;
  const unlockSrc = SILENT_WAV;
  el.src = unlockSrc;
  const p = el.play();
  if (!p) {
    el.muted = false;
    return;
  }
  void p.catch(() => {}).then(() => {
    if (el.src !== unlockSrc) return;
    el.pause();
    el.currentTime = 0;
    el.muted = false;
    el.removeAttribute('src');
  });
}

function waitForAudioReady(el: HTMLAudioElement, timeoutMs: number): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
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
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', onError, { once: true });
  });
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metaRef = useRef<BibleAudioChapterMeta | null>(null);
  const timestampsRef = useRef<AudioTimestampVerse[]>([]);
  const chapterRef = useRef(chapter);
  const bookRef = useRef(bookId);
  const manualScrollUntilRef = useRef(0);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefetchedNextRef = useRef<string | null>(null);
  const checkpointSaveRef = useRef(0);
  const playingBookRef = useRef('');
  const playingChapterRef = useRef(0);

  const [state, setState] = useState<ReaderAudioState>('off');
  const [meta, setMeta] = useState<BibleAudioChapterMeta | null>(null);
  const [settings, setSettings] = useState<ReaderAudioSettings>(DEFAULT_READER_AUDIO_SETTINGS);
  const [focusOpen, setFocusOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coachVisible, setCoachVisible] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [currentVerse, setCurrentVerse] = useState<number | null>(null);
  const [timestamps, setTimestamps] = useState<AudioTimestampVerse[]>([]);

  chapterRef.current = chapter;
  bookRef.current = bookId;

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
          const el = audioRef.current;
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

  const stopInternal = useCallback(() => {
    clearSleepTimer();
    const el = audioRef.current;
    if (el && playingBookRef.current && playingChapterRef.current > 0) {
      persistCheckpoint(
        playingBookRef.current,
        playingChapterRef.current,
        el.currentTime,
        Number.isFinite(el.duration) ? el.duration : undefined,
      );
    }
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    audioRef.current = null;
    timestampsRef.current = [];
    setTimestamps([]);
    setCurrentVerse(null);
    onCurrentVerseChange?.(null);
    setState('off');
    setCurrentSec(0);
    setDurationSec(0);
    setCollapsed(false);
    setFocusOpen(false);
    prefetchedNextRef.current = null;
  }, [clearSleepTimer, onCurrentVerseChange, persistCheckpoint]);

  /** 切章/重载时释放旧音频，但不把 UI 打回 off（保留 loading/playing 语义）。 */
  const releasePreviousAudio = useCallback(() => {
    clearSleepTimer();
    const el = audioRef.current;
    if (el && playingBookRef.current && playingChapterRef.current > 0) {
      persistCheckpoint(
        playingBookRef.current,
        playingChapterRef.current,
        el.currentTime,
        Number.isFinite(el.duration) ? el.duration : undefined,
      );
    }
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    audioRef.current = null;
    prefetchedNextRef.current = null;
  }, [clearSleepTimer, persistCheckpoint]);

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
      setState('loading');
      releasePreviousAudio();
      const el = new Audio();
      primeAudioElement(el);
      audioRef.current = el;
      try {
        const m = await fetchBibleAudioChapter(targetBook, targetChapter, screenVersion);
        metaRef.current = m;
        setMeta(m);
        if (!m.available || !m.stream_path) {
          releasePreviousAudio();
          setState('off');
          if (!opts?.auto) toast('此译本暂无朗读');
          return;
        }
        await loadTimestamps(m);
        el.src = bibleAudioStreamUrl(m.stream_path);
        el.preload = 'auto';
        el.playbackRate = settings.speed;
        playingBookRef.current = targetBook;
        playingChapterRef.current = targetChapter;
        attachMediaSession(el, m);
        applySleepTimer(settings);

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
          setCurrentSec(t);
          if (Number.isFinite(el.duration)) setDurationSec(el.duration);
          updateVerseFromTime(t);
          if (el.duration > 0 && t / el.duration > 0.7) prefetchNextChapter(m);
          const now = Date.now();
          if (now - checkpointSaveRef.current > 5000) {
            checkpointSaveRef.current = now;
            persistCheckpoint(targetBook, targetChapter, t, el.duration);
          }
        });
        el.addEventListener('loadedmetadata', () => {
          if (Number.isFinite(el.duration)) setDurationSec(el.duration);
          maybeRestoreCheckpoint();
        });
        el.addEventListener('ended', () => {
          clearReaderAudioCheckpoint();
          if (settings.sleepTimer === 'chapter') {
            stopInternal();
            toast('定时停止：本章朗读结束');
            return;
          }
          if (settings.continuousChapter) {
            toast(`${bookName} ${targetChapter + 1}`);
            void playChapter(targetBook, targetChapter + 1, {
              auto: true,
              skipCheckpoint: true,
            });
          } else {
            stopInternal();
          }
        });
        el.addEventListener('pause', () => {
          if (el.ended) return;
          persistCheckpoint(targetBook, targetChapter, el.currentTime, el.duration);
          setState('paused');
        });
        el.addEventListener('play', () => {
          hapticLight();
          setState('playing');
        });
        el.addEventListener('error', () => {
          setState('error');
          toast('朗读加载失败');
        });

        await waitForAudioReady(el, 90_000);
        await el.play();
        setState('playing');
        if (!readerAudioCoachSeen()) {
          setCoachVisible(true);
          markReaderAudioCoachSeen();
          window.setTimeout(() => setCoachVisible(false), 2500);
        }
      } catch {
        releasePreviousAudio();
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
      bookName,
      loadTimestamps,
      prefetchNextChapter,
      persistCheckpoint,
      releasePreviousAudio,
      screenVersion,
      settings,
      stopInternal,
      toast,
      updateVerseFromTime,
    ],
  );

  const retryPlay = useCallback(() => {
    void playChapter(bookId, chapter);
  }, [bookId, chapter, playChapter]);

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (state === 'playing' && el) {
      hapticLight();
      el.pause();
      return;
    }
    if (state === 'paused' && el) {
      hapticLight();
      primeAudioElement(el);
      await el.play();
      return;
    }
    if (state === 'error' && el?.src) {
      primeAudioElement(el);
      setState('loading');
      try {
        await waitForAudioReady(el, 90_000);
        await el.play();
        setState('playing');
      } catch {
        setState('error');
        toast('朗读加载失败');
      }
      return;
    }
    primeAudioElement(new Audio());
    await playChapter(bookId, chapter);
  }, [bookId, chapter, playChapter, state, toast]);

  const seekTo = useCallback(
    (sec: number) => {
      const el = audioRef.current;
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
        const el = audioRef.current;
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
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
  }, [pausedByOverlay]);

  useEffect(() => {
    const el = audioRef.current;
    const wasPlaying = state === 'playing' || state === 'paused';
    if (!wasPlaying || !el) return;
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
    const el = audioRef.current;
    if (el) el.playbackRate = settings.speed;
  }, [settings.speed]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      if (settings.backgroundPlay) return;
      const el = audioRef.current;
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
      if (!cancelled) setMeta(m);
    }).catch(() => {
      if (!cancelled) setMeta({ available: false, book: bookId, chapter });
    });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapter, screenVersion]);

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
