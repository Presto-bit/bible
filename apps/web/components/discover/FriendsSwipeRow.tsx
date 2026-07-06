'use client';

import Link from 'next/link';
import type { Friend } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';

type Props = {
  friends: Friend[];
};

/** 发现页好友横滑条 */
export function FriendsSwipeRow({ friends }: Props) {
  if (!friends.length) return null;

  return (
    <div className="friends-swipe-row">
      <div className="friends-swipe-track">
        {friends.map((f) => (
          <Link
            key={f.user_id}
            href={`/discover/friends/${f.user_id}`}
            className="friends-swipe-card"
          >
            <span className="friends-swipe-avatar" aria-hidden>
              {friendDisplayName(f).slice(0, 1)}
            </span>
            <span className="friends-swipe-name">{friendDisplayName(f)}</span>
          </Link>
        ))}
        <Link href="/friend/add" className="friends-swipe-card friends-swipe-add">
          <span className="friends-swipe-avatar" aria-hidden>+</span>
          <span className="friends-swipe-name">加好友</span>
        </Link>
      </div>
    </div>
  );
}
