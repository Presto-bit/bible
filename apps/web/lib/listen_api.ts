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

/** 统一成可播的绝对地址（始终走前端 API_BASE，避免服务端 host 不一致）。 */
function absUrl(url: string | undefined | null): string {
  const raw = (url || '').trim();
  if (!raw) throw new Error('听读地址缺失');
  let path = raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      path = new URL(raw).pathname + new URL(raw).search;
    }
  } catch {
    throw new Error('听读地址无效');
  }
  if (!path.startsWith('/')) path = `/${path}`;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${path}`;
}

async function parseListenJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    throw new Error(res.ok ? '听读响应为空' : `听读请求失败 ${res.status}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Safari 对非 JSON（如 HTML 404）会抛 pattern 错误，这里改成可读文案
    throw new Error(
      res.status === 404
        ? '听读服务未上线：请更新 Nginx 代理 /listen 并重启 API'
        : res.ok
          ? '听读响应异常'
          : `听读请求失败 ${res.status}`,
    );
  }
}

function detailFrom(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const d = (data as { detail?: unknown }).detail;
    if (typeof d === 'string' && d.trim()) return d;
  }
  return fallback;
}

async function listenFetch(path: string, timeoutMs = 30_000): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE.replace(/\/$/, '')}${path}`, {
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
  const data = await parseListenJson(res);
  if (res.status === 202) {
    return data as ListenChapterPending;
  }
  if (!res.ok) {
    throw new Error(detailFrom(data, `听读请求失败 ${res.status}`));
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
    const data = await parseListenJson(res);
    if (!res.ok) {
      throw new Error(detailFrom(data, `任务查询失败 ${res.status}`));
    }
    const typed = data as ListenChapterReady | ListenChapterPending | ListenJobError;
    if (typed.status === 'ready') {
      const ready = typed as ListenChapterReady;
      return { ...ready, url: absUrl(ready.url) };
    }
    if (typed.status === 'error') {
      throw new Error((typed as ListenJobError).error || '合成失败');
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
  if (!first.job_id) throw new Error('听读任务异常');
  return pollListenJob(first.job_id, pollOpts);
}

export function resolveListenVerse(
  timeline: ListenTimelineItem[],
  positionMs: number,
): number | null {
  if (!timeline.length) return null;
  // 取已开始的最后一节；节间空隙保持上一节，避免回跳到首节。
  // 章引（尚未到第 1 节 start）返回 null。
  let current: number | null = null;
  for (const t of timeline) {
    if (positionMs >= t.start_ms) current = t.verse;
  }
  return current;
}

export { DEFAULT_VOICE as LISTEN_DEFAULT_VOICE };
