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
import { FeedVersePreview } from '@/components/discover/FeedVersePreview';

function reactionTotal(reactions: Record<string, string[]> | null | undefined): number {
  if (!reactions) return 0;
  return Object.values(reactions).reduce((n, users) => n + users.length, 0);
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
  const isShare = item.source === 'share';
  const kindLabel = isShare
    ? (item.kind === 'thought' ? '分享了想法' : '分享了笔记')
    : '群内打卡';
  const likes = reactionTotal(item.reactions) + (reacted === '❤️' ? 1 : 0);
  const activityKey = activityReadingKey(item.source, item.id);
  const [readingMarked, setReadingMarked] = useState(() => hasMarkedReading(activityKey));

  const onReading = () => {
    if (!item.ref || readingMarked) return;
    if (markReading(activityKey)) setReadingMarked(true);
  };

  const authorNode = showAuthor ? (
    authorHref ? (
      <Link href={authorHref} className="feed-card-author">
        {item.author || friendDisplayName({ user_id: item.author_id ?? '', display_name: item.author })}
      </Link>
    ) : (
      <span className="feed-card-author">
        {item.author}
      </span>
    )
  ) : null;

  return (
    <article className="card feed-card">
      <div className="feed-card-layout">
        <div className="feed-card-main">
          <header className="feed-card-head">
            <div className="feed-card-head-main">
              {authorNode}
              <div className="feed-card-meta">
                <span className="feed-card-kind">{kindLabel}</span>
                {!isShare && item.group_name && (
                  <span className="feed-card-dot">·</span>
                )}
                {!isShare && item.group_name && (
                  <span className="feed-card-group">{item.group_name}</span>
                )}
              </div>
            </div>
            <time className="feed-card-time muted">{formatActivityTime(item.created_at)}</time>
          </header>

          {item.body && (
            <p className="feed-card-body">{item.body}</p>
          )}

          <footer className="feed-card-foot">
            <button
              type="button"
              className={`feed-card-like${reacted === '❤️' ? ' active' : ''}`}
              onClick={onReact}
              disabled={!onReact}
            >
              {reacted === '❤️' ? '已赞' : '赞'}{likes > 0 ? ` ${likes}` : ''}
            </button>
            {item.ref && (
              <button
                type="button"
                className={`feed-card-reading${readingMarked ? ' active' : ''}`}
                onClick={onReading}
                disabled={readingMarked}
              >
                在读
              </button>
            )}
          </footer>
        </div>

        {item.ref && <FeedVersePreview refParam={item.ref} />}
      </div>
    </article>
  );
}
