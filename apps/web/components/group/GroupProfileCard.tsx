'use client';

import type { GroupDetail, GroupMessage, GroupTask } from '@/lib/api';
import { displayMemberName, groupMemberCount } from '@/lib/group_ui';
import { MemberAvatar } from './MemberAvatar';

type Props = {
  open: boolean;
  detail: GroupDetail;
  tasks: GroupTask[];
  messages: GroupMessage[];
  isOwner?: boolean;
  isStaff?: boolean;
  onClose: () => void;
  onOpenWall: () => void;
  onCheckin: () => void;
  onInvite: () => void;
  onOpenSettings: () => void;
  onOpenMembers?: () => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

/** 群名片：主场感入口（非设置）。 */
export function GroupProfileCard({
  open,
  detail,
  tasks,
  messages,
  isOwner,
  onClose,
  onOpenWall,
  onCheckin,
  onInvite,
  onOpenSettings,
  onOpenMembers,
  onCompleteTask,
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
  const todayCheckins = messages.filter(
    (m) => m.kind === 'checkin' && !m.recalled && !m.id.startsWith('temp-'),
  );
  // rough today filter via local date
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayMs = dayStart.getTime();
  const todayIds = new Set(
    todayCheckins
      .filter((m) => new Date(m.created_at).getTime() >= todayMs)
      .map((m) => m.user_id)
      .filter(Boolean) as string[],
  );

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
            ) : (
              <button type="button" className="btn btn-ghost" onClick={onOpenWall}>
                打卡墙
              </button>
            )}
          </div>
        </section>

        <button type="button" className="group-profile-wall-entry" onClick={onOpenWall}>
          <div className="group-profile-wall-entry-text">
            <strong>今日打卡墙</strong>
            <span className="muted">已打 {checked} 人 · 点开看感想</span>
          </div>
          <div className="group-profile-wall-avatars" aria-hidden>
            {members.slice(0, 5).map((m) => (
              <span
                key={m.user_id || displayMemberName(m)}
                className={`group-profile-wall-av${todayIds.has(m.user_id || '') || m.checked_in_today ? ' is-on' : ''}`}
              >
                <MemberAvatar member={m} size={28} />
              </span>
            ))}
          </div>
          <span className="muted">›</span>
        </button>

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
          {isOwner ? (
            <button type="button" className="btn btn-ghost" onClick={() => { onClose(); onOpenSettings(); }}>
              群设置
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => { onClose(); onOpenSettings(); }}>
              设置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
