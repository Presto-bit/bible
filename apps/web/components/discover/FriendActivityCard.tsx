'use client';

import Link from 'next/link';
import { type MouseEvent } from 'react';
import type { FriendActivity } from '@/lib/api';
import { formatActivityTime } from '@/lib/social_time';
import {
  FEED_LIKE_EMOJI,
  FEED_READING_EMOJI,
  feedActivityKind,
  reactionEmojiCount,
  readerHrefFromFeedActivity,
} from '@/lib/feed_activity';
import { friendDisplayName } from '@/lib/friend_label';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { FeedVersePreview } from '@/components/discover/FeedVersePreview';

type FeedKind = 'checkin' | 'thought' | 'note';

function kindLabel(kind: FeedKind): string {
  if (kind === 'checkin') return '打卡';
  if (kind === 'thought') return '想法';
  return '笔记';
}

type Props = {
  item: FriendActivity;
  showAuthor?: boolean;
  liked?: boolean;
  readingMarked?: boolean;
  onLike?: () => void;
  onReading?: () => void;
  authorHref?: string;
};

export function FriendActivityCard({
  item,
  showAuthor = true,
  liked = false,
  readingMarked = false,
  onLike,
  onReading,
  authorHref,
}: Props) {
  const kind = feedActivityKind(item);
  const label = kindLabel(kind);
  const likeCount = reactionEmojiCount(item.reactions, FEED_LIKE_EMOJI);
  const readingCount = reactionEmojiCount(item.reactions, FEED_READING_EMOJI);
  const readerHref = item.ref ? readerHrefFromFeedActivity(item) : null;

  const onLikeClick = (e: MouseEvent) => {
    e.stopPropagation();
    onLike?.();
  };

  const onReadingClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (readingMarked) return;
    onReading?.();
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
          onClick={onLikeClick}
          disabled={!onLike}
          aria-pressed={liked}
        >
          <span className="feed-action-icon" aria-hidden>{liked ? '♥' : '♡'}</span>
          {likeCount > 0 ? `${likeCount} 人赞` : '赞'}
        </button>
        {item.ref && (
          <button
            type="button"
            className={`feed-action-pill feed-action-read${readingMarked ? ' active' : ''}`}
            onClick={onReadingClick}
            disabled={!onReading || readingMarked}
            aria-pressed={readingMarked}
          >
            {readingCount > 0
              ? `${readingCount} 人在读`
              : readingMarked
                ? '在读中 ✓'
                : '标记在读'}
          </button>
        )}
      </footer>
    </article>
  );
}
