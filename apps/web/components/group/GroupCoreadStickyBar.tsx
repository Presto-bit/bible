'use client';

import type { GroupDetail, GroupTask } from '@/lib/api';
import { groupMemberCount } from '@/lib/group_ui';

type Props = {
  detail: GroupDetail;
  tasks: GroupTask[];
  onCheckin: () => void;
};

/** 群会话内吸顶共读条：计划名 · 今日打卡 X/Y · 进行中任务。 */
export function GroupCoreadStickyBar({ detail, tasks, onCheckin }: Props) {
  const memberTotal = groupMemberCount(detail);
  const checkedIn = detail.checked_in_today ?? 0;
  const openTasks = tasks.filter((t) => !t.completed);
  const planLabel = detail.plan_title?.trim() || '共读群';
  const needCheckin = !detail.my_checked_in_today;

  return (
    <div className="group-coread-sticky group-sticky-zone" role="status">
      <div className="group-coread-sticky-main">
        <strong className="group-coread-sticky-plan">{planLabel}</strong>
        <span className="muted group-coread-sticky-meta">
          今日 {checkedIn}/{memberTotal}
          {openTasks.length > 0 ? ` · 任务 ${openTasks.length}` : ''}
        </span>
      </div>
      {needCheckin ? (
        <button type="button" className="group-coread-sticky-cta" onClick={onCheckin}>
          打卡
        </button>
      ) : (
        <span className="group-coread-sticky-done" aria-hidden>
          ✓
        </span>
      )}
    </div>
  );
}
