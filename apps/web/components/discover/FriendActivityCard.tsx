'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FriendActivity } from '@/lib/api';
import { formatActivityTime } from '@/lib/social_time';
import {
  activityReadingKey,
  hasMarkedReading,
  markReading,
} from '@/lib/reading_amen';
import { friendDisplayName } from '@/lib/friend_label';
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
  const likes = reactionTotal(item.reactions) + (reacted === '❤️' ? 1 : 0);
  const activityKey = activityReadingKey(item.source, item.id);
  const [readingMarked, setReadingMarked] = useState(() => hasMarkedReading(activityKey));

  const onReading = () => {
    if (!item.ref || readingMarked) return;
    if (markReading(activityKey)) setReadingMarked(true);
  };

  const displayName = item.author
    || friendDisplayName({ user_id: item.author_id ?? '', display_name: item.author });
  const friendPick = {
    user_id: item.author_id ?? '',
    display_name: item.author,
    author_avatar_id: item.author_avatar_id,
  };

  const userBlock = showAuthor ? (
    authorHref ? (
      <Link href={authorHref} className="feed-card-user">
        <FriendAvatar friend={friendPick} size={40} />
        <div className="feed-card-user-text">
          <span className="feed-card-user-name">{displayName}</span>
          <span className="feed-card-user-sub">
            <span className="feed-card-badge">{label}</span>
            {kind === 'checkin' && item.group_name && (
              <span className="feed-card-group">{item.group_name}</span>
            )}
          </span>
        </div>
        <time className="feed-card-time">{formatActivityTime(item.created_at)}</time>
      </Link>
    ) : (
      <div className="feed-card-user">
        <FriendAvatar friend={friendPick} size={40} />
        <div className="feed-card-user-text">
          <span className="feed-card-user-name">{displayName}</span>
          <span className="feed-card-user-sub">
            <span className="feed-card-badge">{label}</span>
            {kind === 'checkin' && item.group_name && (
              <span className="feed-card-group">{item.group_name}</span>
            )}
          </span>
        </div>
        <time className="feed-card-time">{formatActivityTime(item.created_at)}</time>
      </div>
    )
  ) : (
    <div className="feed-card-meta-only">
      <span className="feed-card-badge">{label}</span>
      <time className="feed-card-time feed-card-time-inline">
        {formatActivityTime(item.created_at)}
      </time>
      {kind === 'checkin' && item.group_name && (
        <span className="feed-card-group">{item.group_name}</span>
      )}
    </div>
  );

  return (
    <article className={`card feed-card feed-card--${kind}`}>
      <div className="feed-card-accent" aria-hidden />

      <div className="feed-card-body-row">
        <div className="feed-card-left">
          {userBlock}
          {item.body ? (
            <p className="feed-card-quote">{item.body}</p>
          ) : (
            <p className="feed-card-quote feed-card-quote-muted muted">
              {kind === 'checkin' ? '完成今日打卡' : '分享了一段经文'}
            </p>
          )}
        </div>

        {item.ref && <FeedVersePreview refParam={item.ref} kind={kind} />}
      </div>

      <footer className="feed-card-bar">
        <button
          type="button"
          className={`feed-bar-btn${reacted === '❤️' ? ' active' : ''}`}
          onClick={onReact}
          disabled={!onReact}
        >
          <span className="feed-bar-btn-icon" aria-hidden>{reacted === '❤️' ? '♥' : '♡'}</span>
          赞{likes > 0 ? ` ${likes}` : ''}
        </button>
        {item.ref && (
          <button
            type="button"
            className={`feed-bar-btn${readingMarked ? ' active' : ''}`}
            onClick={onReading}
            disabled={readingMarked}
          >
            在读
          </button>
        )}
      </footer>
    </article>
  );
}
