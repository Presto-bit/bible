/** AI 听经 API 客户端。 */

import { API_BASE, authHeaders } from './api_core';

export type ListenTimelineItem = {
  verse: number;
  start_ms: number;
  end_ms: number;
};

export type ListenChapterReady = {
  status: 'ready';
  url: string;
  timeline: ListenTimelineItem[];
  duration_ms: number;
  text_hash: string;
  translation: string;
  translation_label: string;
  voice: string;
  book: string;
  chapter: number;
  book_name: string;
  next?: { book: string; chapter: number } | null;
};

export type ListenChapterPending = {
  status: 'pending';
  job_id: string;
  text_hash?: string;
};

export type ListenJobError = {
  status: 'error';
  job_id?: string;
  error?: string;
};

const DEFAULT_VOICE = 'voice_calm_m';

function absUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
}

async function listenFetch(path: string, timeoutMs = 30_000): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      headers: { ...authHeaders() },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchListenChapter(opts: {
  translation: string;
  book: string;
  chapter: number;
  voice?: string;
}): Promise<ListenChapterReady | ListenChapterPending> {
  const voice = opts.voice || DEFAULT_VOICE;
  const q = new URLSearchParams({
    translation: opts.translation,
    book: opts.book,
    chapter: String(opts.chapter),
    voice,
  });
  const res = await listenFetch(`/listen/chapter?${q}`, 20_000);
  const data = (await res.json()) as ListenChapterReady | ListenChapterPending | { detail?: string };
  if (res.status === 202) {
    return data as ListenChapterPending;
  }
  if (!res.ok) {
    const detail =
      typeof (data as { detail?: string }).detail === 'string'
        ? (data as { detail: string }).detail
        : `听读请求失败 ${res.status}`;
    throw new Error(detail);
  }
  const ready = data as ListenChapterReady;
  return { ...ready, url: absUrl(ready.url) };
}

export async function pollListenJob(
  jobId: string,
  opts?: { signal?: AbortSignal; intervalMs?: number; timeoutMs?: number },
): Promise<ListenChapterReady> {
  const interval = opts?.intervalMs ?? 1200;
  const timeout = opts?.timeoutMs ?? 180_000;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (opts?.signal?.aborted) throw new Error('已取消');
    const res = await listenFetch(`/listen/jobs/${encodeURIComponent(jobId)}`, 20_000);
    const data = (await res.json()) as ListenChapterReady | ListenChapterPending | ListenJobError;
    if (!res.ok) {
      const detailVal = (data as unknown as { detail?: unknown }).detail;
      throw new Error(typeof detailVal === 'string' ? detailVal : `任务查询失败 ${res.status}`);
    }
    if (data.status === 'ready') {
      const ready = data as ListenChapterReady;
      return { ...ready, url: absUrl(ready.url) };
    }
    if (data.status === 'error') {
      throw new Error((data as ListenJobError).error || '合成失败');
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('准备超时，请重试');
}

export async function ensureListenChapter(
  opts: {
    translation: string;
    book: string;
    chapter: number;
    voice?: string;
  },
  pollOpts?: { signal?: AbortSignal },
): Promise<ListenChapterReady> {
  const first = await fetchListenChapter(opts);
  if (first.status === 'ready') return first;
  return pollListenJob(first.job_id, pollOpts);
}

export function resolveListenVerse(
  timeline: ListenTimelineItem[],
  positionMs: number,
): number | null {
  if (!timeline.length) return null;
  for (const t of timeline) {
    if (positionMs >= t.start_ms && positionMs < t.end_ms) return t.verse;
  }
  if (positionMs >= timeline[timeline.length - 1].start_ms) {
    return timeline[timeline.length - 1].verse;
  }
  return timeline[0]?.verse ?? null;
}

export { DEFAULT_VOICE as LISTEN_DEFAULT_VOICE };
