/** PWA 社交实时：优先 SSE，失败回落智能轮询；仅 cursor 变化时回调。 */

import { API_BASE, authHeaders, api } from './api';

export type SocialCursor = {
  group_max?: string | null;
  dm_max?: string | null;
  server_time?: string;
};

export type SocialChangeFlags = {
  group: boolean;
  dm: boolean;
  any: boolean;
};

type Listener = (cursor: SocialCursor, changed: boolean, flags: SocialChangeFlags) => void;

let lastGroup = '';
let lastDm = '';
const listeners = new Set<Listener>();
let stopFn: (() => void) | null = null;
let started = false;

function emit(c: SocialCursor) {
  const g = c.group_max || '';
  const d = c.dm_max || '';
  const group = Boolean(lastGroup) && g !== lastGroup;
  const dm = Boolean(lastDm) && d !== lastDm;
  if (g) lastGroup = g;
  if (d) lastDm = d;
  const flags: SocialChangeFlags = { group, dm, any: group || dm };
  const changed = flags.any;
  for (const fn of listeners) {
    try {
      fn(c, changed, flags);
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
        try {
          const c = await api.realtimeCursor();
          emit(c);
        } catch {
          /* ignore */
        }
        await new Promise((r) => setTimeout(r, 5000));
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

export type SubscribeRealtimeOpts = {
  /** 只关心群 / 私信 / 全部变更 */
  watch?: 'group' | 'dm' | 'all';
  /** 合并短时多次变更，默认 0（立即） */
  debounceMs?: number;
};

/**
 * 订阅社交 cursor。
 * changed=true 表示 group_max 或 dm_max 有变化；可用 flags / watch 过滤。
 */
export function subscribeSocialRealtime(
  onCursor: Listener,
  opts?: SubscribeRealtimeOpts,
): () => void {
  const watch = opts?.watch ?? 'all';
  const debounceMs = opts?.debounceMs ?? 0;
  let timer: number | null = null;

  const handler: Listener = (c, changed, flags) => {
    if (!changed) {
      onCursor(c, false, flags);
      return;
    }
    const relevant =
      watch === 'all' ? flags.any
        : watch === 'group' ? flags.group
          : flags.dm;
    if (!relevant) return;
    if (debounceMs <= 0) {
      onCursor(c, true, flags);
      return;
    }
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      onCursor(c, true, flags);
    }, debounceMs);
  };

  listeners.add(handler);
  ensureStarted();
  // 仅首个订阅者拉一次，避免群/DM/发现同时订阅时打三次
  if (listeners.size === 1) {
    void api.realtimeCursor().then(emit).catch(() => {});
  }
  return () => {
    if (timer) window.clearTimeout(timer);
    listeners.delete(handler);
    if (listeners.size === 0 && stopFn) stopFn();
  };
}

export function peekSocialCursorKey(): string {
  return `${lastGroup}|${lastDm}`;
}
