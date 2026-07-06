'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FriendActivity } from '@/lib/api';
import { formatGroupRefLabel } from '@/lib/ref_label';
import { formatActivityTime } from '@/lib/social_time';
import { bumpReadingAmen, getReadingAmen } from '@/lib/reading_amen';
import { friendDisplayName } from '@/lib/friend_label';

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
  const [amenCount, setAmenCount] = useState(() =>
    item.ref ? getReadingAmen(item.ref) : 0,
  );

  const onAmen = () => {
    if (!item.ref) return;
    setAmenCount(bumpReadingAmen(item.ref));
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

      {item.ref && (
        <p className="feed-card-ref">{formatGroupRefLabel(item.ref)}</p>
      )}

      {item.body && (
        <p className="feed-card-body">{item.body}</p>
      )}

      <footer className="feed-card-foot">
        {onReact && (
          <button type="button" className="feed-card-like" onClick={onReact}>
            {reacted === '❤️' ? '❤️' : '🤍'} {likes > 0 ? likes : '赞'}
          </button>
        )}
        {item.ref && (
          <button type="button" className="feed-card-amen" onClick={onAmen}>
            <span className="feed-card-amen-icon" aria-hidden>📖</span>
            {amenCount > 0 ? `+${amenCount}` : '在读'}
          </button>
        )}
      </footer>
    </article>
  );
}
