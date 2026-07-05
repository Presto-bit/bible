'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, type GroupMember } from '@/lib/api';
import { displayMemberName } from '@/lib/group_ui';
import { dismissPendingGroup, markGroupsListDirty } from '@/lib/groups_refresh';
import { GroupInviteSheet } from './GroupInviteSheet';
import { MemberAvatar } from './MemberAvatar';

const GRID_COLS = 5;
const GRID_MAX_ROWS = 3;

type Props = {
  gid: string;
  members: GroupMember[];
  isOwner: boolean;
  joinCode?: string;
  groupName?: string;
  planDaysTotal?: number;
  variant?: 'list' | 'grid';
  onChanged: () => void;
};

export function GroupMembersPanel({
  gid,
  members,
  isOwner,
  joinCode,
  groupName,
  planDaysTotal,
  variant = 'list',
  onChanged,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [gridExpanded, setGridExpanded] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const me = members.find((m) => m.is_me);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const removeMember = (m: GroupMember) => {
    if (!window.confirm(`确定将「${displayMemberName(m)}」移出群？`)) return;
    void run(`rm-${m.user_id}`, async () => {
      await api.removeGroupMember(gid, m.user_id!);
    });
  };

  const transferTo = (m: GroupMember) => {
    if (!window.confirm(`确定将群主转让给「${displayMemberName(m)}」？转让后你将成为普通成员。`)) return;
    void run(`xfer-${m.user_id}`, async () => {
      await api.transferGroup(gid, m.user_id!);
    });
  };

  const leave = () => {
    if (!window.confirm('确定退出此共读群？')) return;
    void run('leave', async () => {
      await api.removeGroupMember(gid, me!.user_id!);
      dismissPendingGroup(gid);
      markGroupsListDirty();
      router.push('/discover');
    });
  };

  if (variant === 'grid') {
    // 预留邀请 + 格，折叠时仍保证能看到邀请入口
    const inviteSlot = joinCode ? 1 : 0;
    const maxVisible = GRID_COLS * GRID_MAX_ROWS - inviteSlot;
    const needsFold = members.length > maxVisible;
    const visible = gridExpanded || !needsFold ? members : members.slice(0, Math.max(0, maxVisible));

    return (
      <div className="group-members-panel group-members-panel-grid">
        <div className="group-member-grid" role="list">
          {visible.map((m) => (
            <div
              key={m.user_id || displayMemberName(m)}
              className={`group-member-grid-cell${m.is_me ? ' me' : ''}`}
              role="listitem"
            >
              <div
                className={`group-member-grid-avatar${m.checked_in_today ? ' checked' : ''}${m.role === 'owner' ? ' owner' : ''}`}
                title={displayMemberName(m)}
              >
                <MemberAvatar member={m} size={44} />
                {m.role === 'owner' && <em className="group-member-grid-crown" aria-hidden>主</em>}
              </div>
              <span className="group-member-grid-name">{displayMemberName(m)}</span>
            </div>
          ))}
          {joinCode ? (
            <div className="group-member-grid-cell group-member-grid-invite" role="listitem">
              <button
                type="button"
                className="group-member-invite-btn"
                aria-label="邀请好友加入"
                onClick={() => setInviteOpen(true)}
              >
                <span className="group-member-invite-plus" aria-hidden>+</span>
              </button>
              <span className="group-member-grid-name">邀请</span>
            </div>
          ) : null}
        </div>

        {inviteOpen && joinCode && (
          <GroupInviteSheet
            gid={gid}
            groupName={groupName || '共读群'}
            joinCode={joinCode}
            memberUserIds={members.map((m) => m.user_id).filter(Boolean) as string[]}
            onClose={() => setInviteOpen(false)}
          />
        )}

        {needsFold && (
          <button
            type="button"
            className="text-link group-member-grid-expand"
            onClick={() => setGridExpanded((v) => !v)}
          >
            {gridExpanded ? '收起成员' : `展开全部 ${members.length} 人`}
          </button>
        )}

        {isOwner && members.some((m) => m.role !== 'owner') && (
          <button
            type="button"
            className="text-link group-member-manage-toggle"
            onClick={() => setManageOpen((v) => !v)}
          >
            {manageOpen ? '收起成员管理' : '成员管理'}
          </button>
        )}

        {manageOpen && isOwner && (
          <div className="group-member-manage-list">
            {members
              .filter((m) => m.role !== 'owner')
              .map((m) => (
                <div key={m.user_id || displayMemberName(m)} className="group-member-row group-member-row-avatar">
                  <div className={`group-member-avatar-inline${m.checked_in_today ? ' checked' : ''}`}>
                    <MemberAvatar member={m} size={36} />
                  </div>
                  <div className="group-member-info">
                    <span className="group-member-name">{displayMemberName(m)}</span>
                    <span className="muted group-member-sub">
                      {m.checked_in_today ? '今日已打卡 ✓' : '今日未打卡'}
                    </span>
                  </div>
                  <div className="group-member-actions">
                    {m.user_id && (
                      <>
                        <button
                          type="button"
                          className="text-link"
                          disabled={busy !== null}
                          onClick={() => transferTo(m)}
                        >
                          {busy === `xfer-${m.user_id}` ? '…' : '转让'}
                        </button>
                        <button
                          type="button"
                          className="text-link danger"
                          disabled={busy !== null}
                          onClick={() => removeMember(m)}
                        >
                          {busy === `rm-${m.user_id}` ? '…' : '移除'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {err && <p className="group-composer-err" role="alert">{err}</p>}

        {!isOwner && me?.user_id && (
          <button
            type="button"
            className="font-pill danger-pill group-member-leave-btn"
            disabled={busy !== null}
            onClick={leave}
          >
            {busy === 'leave' ? '退出中…' : '退出群'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group-members-panel">
      {joinCode && (
        <button
          type="button"
          className="group-members-invite-row"
          onClick={() => setInviteOpen(true)}
        >
          <span className="group-member-invite-plus sm" aria-hidden>+</span>
          <span>邀请好友加入</span>
        </button>
      )}
      {inviteOpen && joinCode && (
        <GroupInviteSheet
          gid={gid}
          groupName={groupName || '共读群'}
          joinCode={joinCode}
          memberUserIds={members.map((m) => m.user_id).filter(Boolean) as string[]}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {members.map((m) => (
        <div key={m.user_id || displayMemberName(m)} className="group-member-row group-member-row-avatar">
          <div className={`group-member-avatar-inline${m.checked_in_today ? ' checked' : ''}${m.is_me ? ' me' : ''}`}>
            <MemberAvatar member={m} size={36} />
          </div>
          <div className="group-member-info">
            <span className="group-member-name">{displayMemberName(m)}</span>
            <span className="muted group-member-sub">
              {m.checked_in_today ? '今日已打卡 ✓' : '今日未打卡'}
              {planDaysTotal && planDaysTotal > 0 && (m.plan_day ?? 0) > 0
                ? ` · 第 ${m.plan_day}/${planDaysTotal} 天`
                : planDaysTotal && planDaysTotal > 0
                  ? ' · 未开始计划'
                  : ''}
            </span>
          </div>
          <div className="group-member-actions">
            {m.role === 'owner' && <span className="rail-cta">群主</span>}
            {isOwner && m.role !== 'owner' && m.user_id && (
              <>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy !== null}
                  onClick={() => transferTo(m)}
                >
                  {busy === `xfer-${m.user_id}` ? '…' : '转让'}
                </button>
                <button
                  type="button"
                  className="text-link danger"
                  disabled={busy !== null}
                  onClick={() => removeMember(m)}
                >
                  {busy === `rm-${m.user_id}` ? '…' : '移除'}
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {err && <p className="group-composer-err" role="alert">{err}</p>}

      {!isOwner && me?.user_id && (
        <button
          type="button"
          className="font-pill danger-pill"
          style={{ marginTop: 12, width: '100%' }}
          disabled={busy !== null}
          onClick={leave}
        >
          {busy === 'leave' ? '退出中…' : '退出群'}
        </button>
      )}
    </div>
  );
}
