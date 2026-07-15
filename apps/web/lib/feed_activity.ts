import { readerHrefFromRef } from '@/lib/group_footprint';

export const FEED_LIKE_EMOJI = '❤️';
export const FEED_READING_EMOJI = '📖';

export type FeedActivityKind = 'checkin' | 'thought' | 'note';

export type FeedActivityHint = {
  author: string;
  kind: FeedActivityKind;
  groupName?: string | null;
  body?: string | null;
};

export function reactionEmojiCount(
  reactions: Record<string, string[]> | null | undefined,
  emoji: string,
): number {
  if (!reactions) return 0;
  return reactions[emoji]?.length ?? 0;
}

/** URL query 残留的动态提示（群打卡分享回跳），不是好友动态流。 */
export function parseFeedHintFromSearchParams(
  sp: URLSearchParams | { get(name: string): string | null },
): FeedActivityHint | null {
  const author = sp.get('feedAuthor');
  const kindRaw = sp.get('feedKind');
  if (!author || !kindRaw) return null;
  const kind: FeedActivityKind =
    kindRaw === 'thought' || kindRaw === 'note' ? kindRaw : 'checkin';
  return {
    author,
    kind,
    groupName: sp.get('feedGroup'),
    body: sp.get('feedBody'),
  };
}

export function feedHintMessage(hint: FeedActivityHint): string {
  const who = hint.author || '同伴';
  if (hint.kind === 'thought') return `${who} 分享了一则想法`;
  if (hint.kind === 'note') return `${who} 分享了一则笔记`;
  if (hint.groupName) return `${who} 在「${hint.groupName}」打卡`;
  return `${who} 完成了打卡`;
}

/** @deprecated 保留以免旧深链断裂；新入口请用 readerHrefFromRef */
export function readerHrefFromLegacyFeed(ref: string, hint?: FeedActivityHint): string {
  const base = readerHrefFromRef(ref);
  if (!hint || !base) return base || `/reader?flash=${encodeURIComponent(ref)}`;
  const u = new URL(base, 'https://local.invalid');
  u.searchParams.set('feedAuthor', hint.author);
  u.searchParams.set('feedKind', hint.kind);
  if (hint.groupName) u.searchParams.set('feedGroup', hint.groupName);
  if (hint.body) u.searchParams.set('feedBody', hint.body.slice(0, 80));
  return `${u.pathname}${u.search}`;
}
