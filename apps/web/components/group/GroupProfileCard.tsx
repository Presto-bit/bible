'use client';

import type { GroupDetail, GroupMessage, GroupTask } from '@/lib/api';
import { displayMemberName, groupMemberCount } from '@/lib/group_ui';
import { GroupCheckinWall } from './GroupCheckinWall';
import { MemberAvatar } from './MemberAvatar';

type Props = {
  open: boolean;
  groupId: string;
  detail: GroupDetail;
  tasks: GroupTask[];
  messages: GroupMessage[];
  isOwner?: boolean;
  isStaff?: boolean;
  onClose: () => void;
  onCheckin: () => void;
  onInvite: () => void;
  onOpenSettings: () => void;
  onOpenMembers?: () => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
  onReact?: (mid: string, emoji: string) => void;
};

/** 群名片：主场感入口（非设置）；打卡墙直接展示。 */
export function GroupProfileCard({
  open,
  groupId,
  detail,
  tasks,
  messages,
  isOwner,
  isStaff,
  onClose,
  onCheckin,
  onInvite,
  onOpenSettings,
  onOpenMembers,
  onCompleteTask,
  onReact,
}: Props) {
  if (!open) return null;

  const total = groupMemberCount(detail);
  const checked = detail.checked_in_today ?? 0;
  const needCheckin = !detail.my_checked_in_today;
  const intro = (detail.intro || '').trim() || '一起读经打卡';
  const planLine = detail.plan_title?.trim()
    ? detail.plan_days_total
      ? `${detail.plan_title} · 我第 ${detail.my_plan_day ?? 0}/${detail.plan_days_total} 天`
      : detail.plan_title
    : '自由共读';
  const pinned =
    tasks.find((t) => t.id === detail.pinned_task_id && !t.completed)
    || tasks.find((t) => t.pinned && !t.completed)
    || tasks.find((t) => !t.completed);
  const members = Array.isArray(detail.members) ? detail.members : [];

  return (
    <div className="sheet-backdrop group-profile-backdrop" onClick={onClose}>
      <div
        className="sheet card group-profile-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="群名片"
      >
        <div className="half-sheet-grab" aria-hidden />
        <div className="section-row group-profile-head">
          <div className="group-profile-head-text">
            <strong className="group-profile-name">{detail.name}</strong>
            <span className="muted">{total} 人</span>
            <p className="group-profile-intro">{intro}</p>
          </div>
          <button type="button" className="text-link" onClick={onClose}>
            关闭
          </button>
        </div>

        <section className="group-profile-block">
          <div className="group-profile-today">
            <div>
              <span className="group-composer-label">今日共读</span>
              <strong style={{ display: 'block', marginTop: 4 }}>{planLine}</strong>
              <span className="muted" style={{ fontSize: 13 }}>
                打卡 {checked}/{total}
                {tasks.filter((t) => !t.completed).length
                  ? ` · 任务 ${tasks.filter((t) => !t.completed).length}`
                  : ''}
              </span>
            </div>
            {needCheckin ? (
              <button type="button" className="btn" onClick={() => { onClose(); onCheckin(); }}>
                我要打卡
              </button>
            ) : null}
          </div>
        </section>

        <section className="group-profile-block group-profile-wall-block">
          <GroupCheckinWall
            groupId={groupId}
            detail={detail}
            messages={messages}
            isOwner={isStaff || isOwner}
            onReact={onReact}
          />
        </section>

        {pinned ? (
          <section className="group-profile-block">
            <span className="group-composer-label">待完成任务</span>
            <div className="group-profile-task">
              <strong>{pinned.title}</strong>
              {onCompleteTask ? (
                <button
                  type="button"
                  className="font-pill accent"
                  onClick={() => {
                    onClose();
                    onCompleteTask(pinned.id, pinned.title, pinned.ref);
                  }}
                >
                  去完成
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {detail.announcement?.trim() ? (
          <section className="group-profile-block">
            <span className="group-composer-label">公告</span>
            <p className="group-profile-announce">{detail.announcement.trim()}</p>
          </section>
        ) : null}

        <section className="group-profile-block">
          <div className="section-row" style={{ marginBottom: 8 }}>
            <span className="group-composer-label">成员</span>
            {onOpenMembers ? (
              <button type="button" className="text-link" onClick={onOpenMembers}>
                全部
              </button>
            ) : null}
          </div>
          <div className="group-profile-members">
            {members.slice(0, 12).map((m) => (
              <div key={m.user_id || displayMemberName(m)} className="group-profile-member">
                <MemberAvatar member={m} size={36} />
                <span>{displayMemberName(m)}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="group-profile-foot">
          <button type="button" className="btn" style={{ flex: 1 }} onClick={onInvite}>
            邀请好友
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { onClose(); onOpenSettings(); }}>
            {isOwner ? '群设置' : '设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
