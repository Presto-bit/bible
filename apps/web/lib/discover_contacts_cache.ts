/** 发现 · 通讯录本地缓存（好友列表 + 计数摘要） */

import type { Friend, FriendRequestItem } from '@/lib/api';
import { userLsGet, userLsSet } from '@/lib/user_storage';

const CACHE_KEY = 'presto_discover_contacts_cache_v1';

export type DiscoverContactsCache = {
  at: number;
  friends: Friend[];
  groupCount: number;
  groupInviteCount: number;
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
};

export function readDiscoverContactsCache(): DiscoverContactsCache | null {
  try {
    const raw = userLsGet(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiscoverContactsCache;
    if (!Array.isArray(parsed.friends)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDiscoverContactsCache(payload: Omit<DiscoverContactsCache, 'at'>): void {
  try {
    userLsSet(CACHE_KEY, JSON.stringify({ ...payload, at: Date.now() }));
  } catch {
    /* ignore */
  }
}
