/** PWA 社交实时：优先 SSE，失败回落智能轮询；仅 cursor 变化时回调。 */

import { API_BASE, authHeaders, api } from './api';
import { whenHomeBootstrapReady } from './offline_bootstrap';
import { isPeiaiAndroidWebViewShell } from './pwa_platform';

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
let loopAbort: AbortController | null = null;
let flutterHostPaused = false;

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

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function startSseLoop(signal: AbortSignal): void {
  void (async () => {
    let retry = 0;
    while (!signal.aborted) {
      // 普通 PWA / Chrome Host：后台休眠省电；仅旧 WebView 壳保持读流
      if (
        flutterHostPaused
        ||
        typeof document !== 'undefined'
        && document.visibilityState === 'hidden'
        && !isPeiaiAndroidWebViewShell()
      ) {
        await wait(1500, signal);
        continue;
      }
      try {
        await readSseStream(signal);
        retry = 0;
      } catch {
        if (signal.aborted) return;
        // 弱网时避免固定 5 秒空转；最多 60 秒且有抖动。
        retry = Math.min(retry + 1, 6);
        try {
          const c = await api.realtimeCursor();
          emit(c);
        } catch {
          /* ignore */
        }
        const base = Math.min(60_000, 1_000 * 2 ** retry);
        await wait(base + Math.floor(Math.random() * 700), signal);
      }
    }
  })();
}

/** 拉 cursor；可选 abort 旧 SSE 并重建（壳回前台半死连接） */
function kickRealtime(rebuild: boolean) {
  void api.realtimeCursor().then(emit).catch(() => {});
  if (!rebuild || !started) return;
  try {
    loopAbort?.abort();
  } catch {
    /* ignore */
  }
  const ac = new AbortController();
  loopAbort = ac;
  startSseLoop(ac.signal);
}

let startScheduled = false;

function ensureStarted() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const ac = new AbortController();
  loopAbort = ac;
  startSseLoop(ac.signal);

  const onVis = () => {
    if (document.visibilityState === 'visible') kickRealtime(true);
  };
  const onResume = () => kickRealtime(true);
  const onFlutterPause = () => {
    flutterHostPaused = true;
    try {
      loopAbort?.abort();
    } catch {
      /* ignore */
    }
  };
  const onFlutterResume = () => {
    flutterHostPaused = false;
    kickRealtime(true);
  };
  const onOnline = () => kickRealtime(true);

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('peiai-shell-resume', onResume);
  window.addEventListener('peiai-flutter-pause', onFlutterPause);
  window.addEventListener('peiai-flutter-resume', onFlutterResume);
  window.addEventListener('online', onOnline);

  stopFn = () => {
    try {
      loopAbort?.abort();
    } catch {
      /* ignore */
    }
    loopAbort = null;
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('peiai-shell-resume', onResume);
    window.removeEventListener('peiai-flutter-pause', onFlutterPause);
    window.removeEventListener('peiai-flutter-resume', onFlutterResume);
    window.removeEventListener('online', onOnline);
    started = false;
    stopFn = null;
    startScheduled = false;
  };
}

/** 等首页就绪后再开 SSE，避免与 bootstrap / 身份抢带宽 */
function scheduleEnsureStarted() {
  if (started || startScheduled || typeof window === 'undefined') return;
  startScheduled = true;
  whenHomeBootstrapReady(
    () => {
      startScheduled = false;
      if (listeners.size === 0) return;
      ensureStarted();
      void api.realtimeCursor().then(emit).catch(() => {});
    },
    { afterMs: 6_000, fallbackMs: 22_000 },
  );
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
  scheduleEnsureStarted();
  return () => {
    if (timer) window.clearTimeout(timer);
    listeners.delete(handler);
    if (listeners.size === 0 && stopFn) stopFn();
  };
}

export function peekSocialCursorKey(): string {
  return `${lastGroup}|${lastDm}`;
}
