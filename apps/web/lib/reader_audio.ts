/** 本章朗读：API、设置持久化、流 URL。 */

import { API_BASE } from './api_core';

/** 暂时关闭朗读入口（恢复时改为 true）。 */
export const READER_AUDIO_ENABLED = false;

export type ReaderAudioState = 'off' | 'playing' | 'paused' | 'loading' | 'error';

export interface BibleAudioChapterMeta {
  available: boolean;
  book: string;
  book_name?: string;
  chapter: number;
  screen_version?: string | null;
  audio_version?: string | null;
  audio_label?: string;
  granularity?: string;
  has_timestamps?: boolean;
  cached?: boolean;
  stream_path?: string;
  fallback_stream_url?: string;
  timestamps_path?: string;
  copyright?: string;
}

export interface AudioTimestampVerse {
  verse: number;
  start_ms: number;
}

export interface BibleAudioTimestamps {
  book: string;
  chapter: number;
  audio_version?: string;
  has_timestamps: boolean;
  verses: AudioTimestampVerse[];
}

export interface ReaderAudioSettings {
  backgroundPlay: boolean;
  pauseOnTabLeave: boolean;
  continueOnChapterSwipe: boolean;
  continuousChapter: boolean;
  speed: number;
  sleepTimer: 'off' | '15' | '30' | 'chapter';
}

const SETTINGS_KEY = 'reader_audio_settings';
const COACH_KEY = 'reader_audio_coach_seen';
const CHAPTER_TOAST_KEY = 'reader_audio_chapter_toast_seen';
const CHECKPOINT_KEY = 'reader_audio_checkpoint';
const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;

export interface ReaderAudioCheckpoint {
  book: string;
  chapter: number;
  sec: number;
  savedAt: number;
}

export function loadReaderAudioCheckpoint(
  book: string,
  chapter: number,
): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const cp = JSON.parse(raw) as ReaderAudioCheckpoint;
    if (cp.book !== book || cp.chapter !== chapter) return null;
    if (Date.now() - cp.savedAt > CHECKPOINT_TTL_MS) return null;
    if (!Number.isFinite(cp.sec) || cp.sec < 3) return null;
    return cp.sec;
  } catch {
    return null;
  }
}

export function saveReaderAudioCheckpoint(
  book: string,
  chapter: number,
  sec: number,
): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(sec) || sec < 3) return;
  const payload: ReaderAudioCheckpoint = {
    book,
    chapter,
    sec,
    savedAt: Date.now(),
  };
  localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(payload));
}

export function clearReaderAudioCheckpoint(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CHECKPOINT_KEY);
}

/** 朗读仅在线流式播放，不提供音频文件下载。 */
export function isReaderAudioNetworkAvailable(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export const DEFAULT_READER_AUDIO_SETTINGS: ReaderAudioSettings = {
  backgroundPlay: true,
  pauseOnTabLeave: false,
  continueOnChapterSwipe: true,
  continuousChapter: false,
  speed: 1,
  sleepTimer: 'off',
};

export function loadReaderAudioSettings(): ReaderAudioSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_READER_AUDIO_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_READER_AUDIO_SETTINGS };
    return { ...DEFAULT_READER_AUDIO_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_READER_AUDIO_SETTINGS };
  }
}

export function saveReaderAudioSettings(s: ReaderAudioSettings): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function readerAudioCoachSeen(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(COACH_KEY) === '1';
}

export function markReaderAudioCoachSeen(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(COACH_KEY, '1');
}

export function readerAudioChapterToastSeen(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(CHAPTER_TOAST_KEY) === '1';
}

export function markReaderAudioChapterToastSeen(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CHAPTER_TOAST_KEY, '1');
}

export function bibleAudioStreamUrl(streamPath: string): string {
  const p = streamPath.startsWith('/') ? streamPath : `/${streamPath}`;
  return `${API_BASE}${p}`;
}

/** API 流优先；服务端缓存失败时可回退 FHL CDN 直链。 */
export function resolveBibleAudioStreamUrls(meta: BibleAudioChapterMeta): string[] {
  const urls: string[] = [];
  if (meta.stream_path) urls.push(bibleAudioStreamUrl(meta.stream_path));
  if (meta.fallback_stream_url && !urls.includes(meta.fallback_stream_url)) {
    urls.push(meta.fallback_stream_url);
  }
  return urls;
}

export async function fetchBibleAudioTimestamps(
  audioVersion: string,
  book: string,
  chapter: number,
): Promise<BibleAudioTimestamps> {
  const res = await fetch(
    `${API_BASE}/bible/audio/timestamps/${encodeURIComponent(audioVersion)}/${encodeURIComponent(book)}/${chapter}`,
  );
  if (!res.ok) {
    return { book, chapter, has_timestamps: false, verses: [] };
  }
  return res.json() as Promise<BibleAudioTimestamps>;
}

export function resolveCurrentVerse(
  positionMs: number,
  timestamps: AudioTimestampVerse[],
): number | null {
  if (!timestamps.length) return null;
  let current = timestamps[0]?.verse ?? null;
  for (const row of timestamps) {
    if (row.start_ms <= positionMs + 120) current = row.verse;
    else break;
  }
  return current;
}

export async function fetchBibleAudioChapter(
  book: string,
  chapter: number,
  screenVersion?: string,
): Promise<BibleAudioChapterMeta> {
  const params = new URLSearchParams({
    book,
    chapter: String(chapter),
  });
  if (screenVersion) params.set('version', screenVersion);
  const res = await fetch(`${API_BASE}/bible/audio/chapter?${params}`);
  if (!res.ok) throw new Error('audio_meta_failed');
  return res.json() as Promise<BibleAudioChapterMeta>;
}
