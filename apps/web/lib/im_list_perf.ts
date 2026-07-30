/** IM 消息列表性能：跳过无变化 setState、合并并发 reload、尾部增量合并。 */

type MsgLike = {
  id: string;
  body?: string | null;
  kind?: string | null;
  ref?: string | null;
  reply_to_id?: string | null;
  recalled?: boolean;
  pending?: boolean;
  sendFailed?: boolean;
  author?: string | null;
  mentions?: string[] | null;
  reactions?: unknown;
  attachments?: Array<{ id?: string; url?: string | null }> | null;
  created_at?: string | null;
  mine?: boolean;
};

function msgSig(m: MsgLike): string {
  const at =
    m.attachments?.map((a) => `${a.id ?? ''}:${a.url ?? ''}`).join(',') ?? '';
  const rx = m.reactions == null ? '' : JSON.stringify(m.reactions);
  const mentions = m.mentions?.join(',') ?? '';
  return [
    m.id,
    m.body ?? '',
    m.kind ?? '',
    m.ref ?? '',
    m.reply_to_id ?? '',
    m.recalled ? 1 : 0,
    m.pending ? 1 : 0,
    m.sendFailed ? 1 : 0,
    m.author ?? '',
    mentions,
    rx,
    at,
    m.created_at ?? '',
  ].join('\u001f');
}

/** 列表视觉签名一致则返回 prev，避免整表重渲染 */
export function keepIfSameMessageList<T extends MsgLike>(prev: T[], next: T[]): T[] {
  if (prev === next) return prev;
  if (prev.length !== next.length) return next;
  for (let i = 0; i < prev.length; i++) {
    if (msgSig(prev[i]!) !== msgSig(next[i]!)) return next;
  }
  return prev;
}

/**
 * Realtime / 热刷新：用最新一页 incoming 替换尾部，保留已翻页的更早历史与本地 temp。
 * 避免每次 cursor 变化把 loadMore 加载的旧消息冲掉。
 */
export function mergeImMessageTail<T extends MsgLike>(prev: T[], incoming: T[]): T[] {
  if (!incoming.length) return prev;
  if (!prev.length) return incoming;

  const isTemp = (id: string) => id.startsWith('temp-');
  const temps = prev.filter((m) => isTemp(m.id));
  const stablePrev = prev.filter((m) => !isTemp(m.id));
  if (!stablePrev.length) {
    return keepIfSameMessageList(prev, [...incoming, ...temps]);
  }

  const incomingIds = new Set(incoming.map((m) => m.id));
  let oldestIncoming = '';
  for (const m of incoming) {
    const t = m.created_at || '';
    if (t && (!oldestIncoming || t < oldestIncoming)) oldestIncoming = t;
  }

  const history = stablePrev.filter((m) => {
    if (incomingIds.has(m.id)) return false;
    const t = m.created_at || '';
    if (!oldestIncoming || !t) return false;
    return t < oldestIncoming;
  });

  const merged: T[] = [...history, ...incoming];
  for (const t of temps) {
    const dup = merged.some(
      (m) =>
        Boolean(m.mine) === Boolean(t.mine)
        && (m.kind || '') === (t.kind || '')
        && (m.body || '') === (t.body || '')
        && (m.ref || '') === (t.ref || '')
        && Math.abs(
          new Date(m.created_at || 0).getTime() - new Date(t.created_at || 0).getTime(),
        ) < 120_000,
    );
    if (!dup) merged.push(t);
  }

  let needsSort = false;
  for (let i = 1; i < merged.length; i++) {
    const a = merged[i - 1]!.created_at || '';
    const b = merged[i]!.created_at || '';
    if (a && b && a > b) {
      needsSort = true;
      break;
    }
  }
  const next = needsSort
    ? [...merged].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    : merged;
  return keepIfSameMessageList(prev, next);
}

/**
 * 合并并发 reload：飞行中再触发则排队，结束后补跑一轮，避免丢更新。
 * 用 ref 持有 gate，跨 useCallback 复用。
 */
export type ReloadGate = {
  busy: boolean;
  queued: boolean;
};

export async function runReloadGate(
  gate: ReloadGate,
  run: () => Promise<void>,
): Promise<void> {
  if (gate.busy) {
    gate.queued = true;
    return;
  }
  gate.busy = true;
  try {
    do {
      gate.queued = false;
      await run();
    } while (gate.queued);
  } finally {
    gate.busy = false;
  }
}
