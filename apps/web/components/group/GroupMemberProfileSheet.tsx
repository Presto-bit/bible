'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, type GroupMember } from '@/lib/api';
import { friendRemarkOrName } from '@/lib/friend_remarks';
import { displayMemberName } from '@/lib/group_ui';
import { MemberAvatar } from './MemberAvatar';

type Props = {
  member: GroupMember | null;
  onClose: () => void;
};

/** 群聊内点头像：弹层展示成员信息，私信再跳转。 */
export function GroupMemberProfileSheet({ member, onClose }: Props) {
  const router = useRouter();
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [dmBusy, setDmBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!member?.user_id || member.is_me) return;
    let cancelled = false;
    void api.friends()
      .then((res) => {
        if (cancelled) return;
        setFriendIds(new Set(res.friends.map((f) => f.user_id)));
      })
      .catch(() => {
        if (!cancelled) setFriendIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [member?.user_id, member?.is_me]);

  const displayName = useMemo(() => {
    if (!member) return '';
    if (member.is_me) return '我';
    const base = displayMemberName(member);
    return member.user_id ? friendRemarkOrName(member.user_id, base) : base;
  }, [member]);

  const roleLabel = (() => {
    if (!member) return '';
    if (member.role === 'owner') return '群主';
    if (member.role === 'admin') return '管理员';
    return '成员';
  })();

  const openDm = async () => {
    if (!member?.user_id || member.is_me) return;
    setDmBusy(true);
    setErr(null);
    try {
      const dm = await api.openDm(member.user_id);
      onClose();
      router.push(`/discover/dm/${dm.thread_id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '打开私信失败');
    } finally {
      setDmBusy(false);
    }
  };

  if (!member) return null;

  const isFriend = Boolean(member.user_id && friendIds.has(member.user_id));

  return (
    <div className="sheet-backdrop group-member-profile-backdrop" onClick={onClose}>
      <div
        className="sheet card group-member-profile-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="成员信息"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="group-member-profile-main">
          <MemberAvatar member={member} size={56} className="group-member-profile-avatar" />
          <strong>{displayName}</strong>
          <span className="muted">{roleLabel}</span>
        </div>
        {err ? <p className="group-composer-err">{err}</p> : null}
        <div className="group-member-profile-actions">
          {!member.is_me && isFriend ? (
            <button
              type="button"
              className="btn"
              disabled={dmBusy}
              onClick={() => void openDm()}
            >
              {dmBusy ? '打开中…' : '发私信'}
            </button>
          ) : null}
          <button type="button" className="font-pill" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
