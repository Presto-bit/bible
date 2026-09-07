/** IM 会话消息本地缓存：私聊 / 群聊首屏 hydrate，对齐发现列表 conv cache。 */

import { userLsGet, userLsSet } from '@/lib/user_storage';

const CACHE_VERSION = 'v1';
const MAX_MESSAGES = 50;

export type ImThreadScope = 'dm' | 'group';

export type ImThreadCacheMeta = {
  peer_user_id?: string | null;
  peer_title?: string | null;
  title?: string | null;
};

export type ImThreadCachePayload<T = unknown> = {
  at: number;
  messages: T[];
  meta?: ImThreadCacheMeta;
};

function cacheKey(scope: ImThreadScope, id: string): string {
  return `presto_im_thread_${CACHE_VERSION}_${scope}_${id}`;
}

export function readImThreadCache<T = unknown>(
  scope: ImThreadScope,
  id: string,
): ImThreadCachePayload<T> | null {
  if (!id) return null;
  try {
    const raw = userLsGet(cacheKey(scope, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImThreadCachePayload<T>;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeImThreadCache<T = unknown>(
  scope: ImThreadScope,
  id: string,
  messages: T[],
  meta?: ImThreadCacheMeta,
): void {
  if (!id || !messages.length) return;
  try {
    userLsSet(
      cacheKey(scope, id),
      JSON.stringify({
        at: Date.now(),
        messages: messages.slice(-MAX_MESSAGES),
        meta,
      } satisfies ImThreadCachePayload<T>),
    );
  } catch {
    /* ignore */
  }
}
