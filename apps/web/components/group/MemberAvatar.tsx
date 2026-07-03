'use client';

import Avatar from '@/components/Avatar';
import type { GroupMember } from '@/lib/api';
import { memberAvatarId } from '@/lib/member_avatar';

type Props = {
  member: GroupMember;
  size?: number;
  className?: string;
  dimmed?: boolean;
};

export function MemberAvatar({ member, size = 32, className = '', dimmed }: Props) {
  return (
    <span
      className={`member-avatar-wrap${dimmed ? ' member-avatar-dimmed' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Avatar id={memberAvatarId(member)} size={size} />
    </span>
  );
}
