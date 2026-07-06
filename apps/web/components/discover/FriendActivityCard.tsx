'use client';

import Link from 'next/link';
import { useState, type MouseEvent } from 'react';
import type { FriendActivity } from '@/lib/api';
import { formatActivityTime } from '@/lib/social_time';
import {
  activityReadingKey,
  hasMarkedReading,
  markReading,
} from '@/lib/reading_amen';
import { friendDisplayName } from '@/lib/friend_label';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { FeedVersePreview } from '@/components/discover/FeedVersePreview';

function reactionTotal(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
}

type FeedKind = 'checkin' | 'thought' | 'note';

function feedKind(item: FriendActivity): FeedKind {
  if (item.source !== 'share') return 'checkin';
  return item.kind === 'thought' ? 'thought' : 'note';
}

function kindLabel(kind: FeedKind): string {
  if (kind === 'checkin') return '打卡';
  if (kind === 'thought') return '想法';
  return '笔记';
}

type Props = {
  item: FriendActivity;
  showAuthor?: boolean;
  reacted?: string;
  onReact?: () => void;
  authorHref?: string;
};

export function FriendActivityCard({
  item,
  showAuthor = true,
  reacted = '',
  onReact,
  authorHref,
}: Props) {
  const kind = feedKind(item);
  const label = kindLabel(kind);
  const liked = reacted === '❤️';
  const likes = reactionTotal(item.reactions) + (liked ? 1 : 0);
  const activityKey = activityReadingKey(item.source, item.id);
  const [readingMarked, setReadingMarked] = useState(() => hasMarkedReading(activityKey));
  const readerHref = item.ref ? readerHrefFromRef(item.ref) : null;

  const onReading = (e: MouseEvent) => {
    e.stopPropagation();
    if (!item.ref || readingMarked) return;
    if (markReading(activityKey)) setReadingMarked(true);
  };

  const onLike = (e: MouseEvent) => {
    e.stopPropagation();
    onReact?.();
  };

  const displayName = item.author
    || friendDisplayName({ user_id: item.author_id ?? '', display_name: item.author });
  const friendPick = {
    user_id: item.author_id ?? '',
    display_name: item.author,
    author_avatar_id: item.author_avatar_id,
  };

  const metaLine = (
    <>
      <span className="feed-card-badge">{label}</span>
      {kind === 'checkin' && item.group_name && (
        <span className="feed-card-group">{item.group_name}</span>
      )}
    </>
  );

  const headUser = showAuthor ? (
    <>
      <span className={`feed-card-avatar-wrap feed-card-avatar-wrap--${kind}`}>
        <FriendAvatar friend={friendPick} size={44} />
      </span>
      <div className="feed-card-head-text">
        <span className="feed-card-user-name">{displayName}</span>
        <span className="feed-card-user-sub">{metaLine}</span>
      </div>
    </>
  ) : (
    <div className="feed-card-head-text feed-card-head-text--solo">
      {metaLine}
    </div>
  );

  return (
    <article className={`card feed-card feed-card--${kind}`}>
      <header className="feed-card-head">
        {showAuthor && authorHref ? (
          <Link href={authorHref} className="feed-card-head-user">
            {headUser}
          </Link>
        ) : (
          <div className="feed-card-head-user">{headUser}</div>
        )}
        <time className="feed-card-time">{formatActivityTime(item.created_at)}</time>
      </header>

      {item.ref && (
        <FeedVersePreview refParam={item.ref} kind={kind} href={readerHref} />
      )}

      {item.body ? (
        <p className="feed-card-reflection">{item.body}</p>
      ) : kind === 'checkin' ? (
        <p className="feed-card-status">已完成今日打卡 ✓</p>
      ) : null}

      <footer className="feed-card-actions">
        <button
          type="button"
          className={`feed-action-pill feed-action-like${liked ? ' active' : ''}`}
          onClick={onLike}
          disabled={!onReact}
          aria-pressed={liked}
        >
          <span className="feed-action-icon" aria-hidden>{liked ? '♥' : '♡'}</span>
          {likes > 0 ? likes : '赞'}
        </button>
        {item.ref && (
          <button
            type="button"
            className={`feed-action-pill feed-action-read${readingMarked ? ' active' : ''}`}
            onClick={onReading}
            aria-pressed={readingMarked}
          >
            {readingMarked ? '在读中 ✓' : '标记在读'}
          </button>
        )}
      </footer>
    </article>
  );
}
