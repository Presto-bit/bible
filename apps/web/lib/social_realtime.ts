/** PWA 社交实时：优先 SSE，失败回落智能轮询；仅 cursor 变化时回调。 */

import { API_BASE, authHeaders, api } from './api';

export type SocialCursor = {
  group_max?: string | null;
  dm_max?: string | null;
  server_time?: string;
};

type Listener = (cursor: SocialCursor, changed: boolean) => void;

let lastKey = '';
const listeners = new Set<Listener>();
let stopFn: (() => void) | null = null;
let started = false;

function cursorKey(c: SocialCursor): string {
  return `${c.group_max || ''}|${c.dm_max || ''}`;
}

function emit(c: SocialCursor) {
  const key = cursorKey(c);
  const changed = Boolean(lastKey) && key !== lastKey;
  if (key) lastKey = key;
  for (const fn of listeners) {
    try {
      fn(c, changed);
    } catch {
      /* ignore */
    }
  }
}

async function readSseStream(signal: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/social/realtime/sse`, {
    method: 'GET',
    headers: { ...authHeaders(), Accept: 'text/event-stream' },
    signal,
    cache: 'no-store',
  });
  if (!res.ok || !res.body) throw new Error(`sse ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let eventName = 'message';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const chunks = buf.split('\n');
    buf = chunks.pop() || '';
    for (const line of chunks) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:') && eventName === 'cursor') {
        try {
          const data = JSON.parse(line.slice(5).trim()) as SocialCursor;
          emit(data);
        } catch {
          /* ignore */
        }
        eventName = 'message';
      } else if (line === '') {
        eventName = 'message';
      }
    }
  }
}

function startSseLoop(signal: AbortSignal): void {
  void (async () => {
    while (!signal.aborted) {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      try {
        await readSseStream(signal);
      } catch {
        if (signal.aborted) return;
        // 回落：单次 cursor 拉取
        try {
          const c = await api.realtimeCursor();
          emit(c);
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  })();
}

function ensureStarted() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const ac = new AbortController();
  startSseLoop(ac.signal);
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      void api.realtimeCursor().then(emit).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVis);
  stopFn = () => {
    ac.abort();
    document.removeEventListener('visibilitychange', onVis);
    started = false;
    stopFn = null;
  };
}

/**
 * 订阅社交 cursor。仅在 group_max/dm_max 变化时 changed=true。
 * 返回取消订阅函数。
 */
export function subscribeSocialRealtime(onCursor: Listener): () => void {
  listeners.add(onCursor);
  ensureStarted();
  // 立即拉一次，避免首屏空白等待
  void api.realtimeCursor().then(emit).catch(() => {});
  return () => {
    listeners.delete(onCursor);
    if (listeners.size === 0 && stopFn) stopFn();
  };
}

export function peekSocialCursorKey(): string {
  return lastKey;
}
