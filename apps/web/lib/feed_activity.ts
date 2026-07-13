import type { FriendActivity } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';

export const FEED_LIKE_EMOJI = '❤️';
export const FEED_READING_EMOJI = '📖';

/** 发现页主 Feed 新鲜度窗口（小时） */
export const FEED_FRESH_HOURS = 48;

export type FeedActivityKind = 'checkin' | 'thought' | 'note';

export type FeedActivityHint = {
  author: string;
  kind: FeedActivityKind;
  groupName?: string | null;
  body?: string | null;
};

export function feedActivityKind(item: FriendActivity): FeedActivityKind {
  if (item.source !== 'share') return 'checkin';
  return item.kind === 'thought' ? 'thought' : 'note';
}

export function reactionEmojiCount(
  reactions: Record<string, string[]> | null | undefined,
  emoji: string,
): number {
  if (!reactions) return 0;
  return reactions[emoji]?.length ?? 0;
}

/** 按新鲜度拆分：近 N 小时置顶，更早默认折叠。 */
export function splitFriendActivityByFreshness(
  items: FriendActivity[],
  hours = FEED_FRESH_HOURS,
  nowMs = Date.now(),
): { recent: FriendActivity[]; older: FriendActivity[] } {
  const cutoff = nowMs - hours * 3600_000;
  const recent: FriendActivity[] = [];
  const older: FriendActivity[] = [];
  for (const item of items) {
    const t = Date.parse(item.created_at);
    if (Number.isFinite(t) && t >= cutoff) recent.push(item);
    else older.push(item);
  }
  return { recent, older };
}

export function feedHintMessage(h: FeedActivityHint): string {
  if (h.kind === 'checkin') {
    return h.groupName
      ? `${h.author} 在「${h.groupName}」打卡了本节`
      : `${h.author} 打卡了本节`;
  }
  if (h.kind === 'thought') return `${h.author} 分享了想法`;
  return `${h.author} 分享了笔记`;
}

/** 好友动态 → 阅读器：定位经节 + 动态提示参数。 */
export function readerHrefFromFeedActivity(item: FriendActivity): string | null {
  if (!item.ref) return null;
  const base = readerHrefFromRef(item.ref);
  if (!base) return null;
  const params = new URLSearchParams(base.split('?')[1] ?? '');
  params.set('flash', item.ref);
  params.set('feedAuthor', item.author);
  params.set('feedKind', feedActivityKind(item));
  if (item.group_name) params.set('feedGroup', item.group_name);
  if (item.body?.trim()) params.set('feedBody', item.body.trim().slice(0, 120));
  return `/reader?${params.toString()}`;
}

export function parseFeedHintFromSearchParams(
  params: URLSearchParams,
): FeedActivityHint | null {
  const author = params.get('feedAuthor');
  if (!author) return null;
  const kind = params.get('feedKind');
  if (kind !== 'checkin' && kind !== 'thought' && kind !== 'note') return null;
  return {
    author,
    kind,
    groupName: params.get('feedGroup'),
    body: params.get('feedBody'),
  };
}
