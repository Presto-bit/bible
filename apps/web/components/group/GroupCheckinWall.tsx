'use client';

import type { GroupDetail } from '@/lib/api';
import { groupDetailTodayLine } from '@/lib/group_status';
import { GroupMemberAvatars } from './GroupMemberAvatars';

type Props = {
  detail: GroupDetail;
  onOpenMembers: () => void;
};

export function GroupCheckinWall({ detail, onOpenMembers }: Props) {
  const members = detail.members ?? [];
  const checked = detail.checked_in_today ?? 0;
  const total = members.length || 1;
  const pending = Math.max(0, total - checked);

  return (
    <section className="group-checkin-wall card card-2">
      <div className="group-checkin-wall-head">
        <strong>打卡墙</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {groupDetailTodayLine(detail)}
          {pending > 0 ? ` · ${pending} 人未打卡` : ''}
        </span>
      </div>
      <GroupMemberAvatars
        members={members}
        isOwner={detail.role === 'owner'}
        onShowMembers={onOpenMembers}
      />
    </section>
  );
}
