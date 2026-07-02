'use client';

import type { GroupMember } from '@/lib/api';
import { memberAvatarInitial, displayMemberName } from '@/lib/group_ui';

type Props = {
  members: GroupMember[];
  isOwner?: boolean;
  onShowMembers: () => void;
};

export function GroupMemberAvatars({ members, isOwner, onShowMembers }: Props) {
  if (members.length === 0) return null;

  return (
    <div className="group-member-avatars-wrap">
      <div className="group-member-avatars">
        {members.map((m) => {
          const key = m.user_id || m.name;
          const checked = Boolean(m.checked_in_today);
          const pulse = isOwner && !checked && m.role !== 'owner';
          return (
            <button
              key={key}
              type="button"
              className={`group-member-avatar${checked ? ' checked' : ' pending'}${pulse ? ' pulse' : ''}${m.is_me ? ' me' : ''}`}
              title={`${displayMemberName(m)}${checked ? ' · 已打卡' : ' · 待打卡'}`}
              onClick={onShowMembers}
            >
              <span className="group-member-avatar-letter">{memberAvatarInitial(m)}</span>
              {checked && <span className="group-member-avatar-check" aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className="group-member-avatars-link text-link" onClick={onShowMembers}>
        全部成员 ›
      </button>
    </div>
  );
}
