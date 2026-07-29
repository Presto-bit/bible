/** IM 消息列表性能：跳过无变化 setState、合并并发 reload。 */

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
