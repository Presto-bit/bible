'use client';

import type { Friend } from '@/lib/api';
import { friendDisplayName } from '@/lib/friend_label';
import { friendRemarkOrName } from '@/lib/friend_remarks';

export function FriendAvatar({
  friend,
  size = 44,
  className = '',
}: {
  friend: Pick<Friend, 'user_id' | 'display_name' | 'handle'>;
  size?: number;
  className?: string;
}) {
  const name = friendRemarkOrName(friend.user_id, friendDisplayName(friend));
  return (
    <span
      className={`friend-avatar ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  );
}
