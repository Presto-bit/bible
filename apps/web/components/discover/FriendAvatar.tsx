'use client';

import Avatar from '@/components/Avatar';
import type { Friend } from '@/lib/api';
import { friendAvatarId } from '@/lib/friend_avatar';

export function FriendAvatar({
  friend,
  size = 44,
  className = '',
}: {
  friend: Pick<Friend, 'user_id'> & {
    avatar_id?: string | null;
    author_avatar_id?: string | null;
  };
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`friend-avatar ${className}`.trim()}
      style={{ width: size, height: size, flexShrink: 0 }}
      aria-hidden
    >
      <Avatar id={friendAvatarId(friend)} size={size} />
    </span>
  );
}
