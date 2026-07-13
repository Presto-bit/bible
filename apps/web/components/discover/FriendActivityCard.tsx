'use client';

import Link from 'next/link';
import { type MouseEvent } from 'react';
import type { FriendActivity } from '@/lib/api';
import { formatActivityTime } from '@/lib/social_time';
import {
  FEED_LIKE_EMOJI,
  feedActivityKind,
  reactionEmojiCount,
  readerHrefFromFeedActivity,
} from '@/lib/feed_activity';
import { friendDisplayName } from '@/lib/friend_label';
import { FriendAvatar } from '@/components/discover/FriendAvatar';
import { FeedVerseMedium } from '@/components/discover/FeedVersePreview';

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
  onLike?: () => void;
  authorHref?: string;
};

export function FriendActivityCard({
  item,
  showAuthor = true,
  liked = false,
  onLike,
  authorHref,
}: Props) {
  const kind = feedActivityKind(item);
  const label = kindLabel(kind);
  const likeCount = reactionEmojiCount(item.reactions, FEED_LIKE_EMOJI);
  const readerHref = item.ref ? readerHrefFromFeedActivity(item) : null;
  const body = item.body?.trim() || '';
  const showThought = Boolean(body);

  const onLikeClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onLike?.();
  };

  const displayName = item.author
    || friendDisplayName({ user_id: item.author_id ?? '', display_name: item.author });
  const friendPick = {
    user_id: item.author_id ?? '',
    display_name: item.author,
    author_avatar_id: item.author_avatar_id,
  };

  const metaBits = [label];
  if (kind === 'checkin' && item.group_name) metaBits.push(item.group_name);

  return (
    <article
      className={`card feed-card feed-card-mid feed-card--${kind}${showThought ? ' has-thought' : ''}`}
    >
      <div className="feed-card-mid-head">
        {showAuthor ? (
          authorHref ? (
            <Link
              href={authorHref}
              className="feed-card-mid-avatar"
              aria-label={displayName}
            >
              <FriendAvatar friend={friendPick} size={28} />
            </Link>
          ) : (
            <span className="feed-card-mid-avatar">
              <FriendAvatar friend={friendPick} size={28} />
            </span>
          )
        ) : null}

        <div className="feed-card-mid-who">
          {showAuthor && authorHref ? (
            <Link href={authorHref} className="feed-card-mid-name">
              {displayName}
            </Link>
          ) : showAuthor ? (
            <span className="feed-card-mid-name">{displayName}</span>
          ) : null}
          <span className="feed-card-mid-meta">
            {showAuthor ? ` · ${metaBits.join(' · ')}` : metaBits.join(' · ')}
          </span>
        </div>
        <time className="feed-card-mid-time">{formatActivityTime(item.created_at)}</time>
      </div>

      {item.ref ? (
        <FeedVerseMedium refParam={item.ref} kind={kind} href={readerHref} />
      ) : null}

      <div className="feed-card-mid-foot">
        <div className="feed-card-mid-foot-main">
          {showThought ? (
            <p className="feed-card-mid-thought">{body}</p>
          ) : !item.ref ? (
            <p className="feed-card-mid-thought muted">分享了一条动态</p>
          ) : null}
        </div>
        <button
          type="button"
          className={`feed-card-mid-like${liked ? ' is-active' : ''}`}
          onClick={onLikeClick}
          disabled={!onLike}
          aria-pressed={liked}
          aria-label={liked ? '取消赞' : '赞'}
        >
          <span aria-hidden>{liked ? '♥' : '♡'}</span>
          {likeCount > 0 ? <em>{likeCount}</em> : null}
        </button>
      </div>
    </article>
  );
}
