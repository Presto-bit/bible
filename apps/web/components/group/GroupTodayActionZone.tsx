'use client';

import Link from 'next/link';
import type { GroupDetail, GroupTask } from '@/lib/api';
import { formatDueCountdown } from '@/lib/group_ui';
import { readerHrefFromRef } from '@/lib/group_footprint';

type Props = {
  detail: GroupDetail;
  gid: string;
  pinnedTask?: GroupTask | null;
  busy?: boolean;
  onQuickCheckin: () => void;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
  onOpenComposer: () => void;
};

export function GroupTodayActionZone({
  detail,
  gid,
  pinnedTask,
  busy,
  onQuickCheckin,
  onCompleteTask,
  onOpenComposer,
}: Props) {
  const members = detail.members.length;
  const checked = detail.checked_in_today ?? 0;
  const openTasks = detail.open_tasks ?? 0;
  const pct = members > 0 ? Math.round((checked / members) * 100) : 0;

  const myLabel = detail.my_checked_in_today
    ? '今日已打卡 ✓'
    : openTasks > 0
      ? `${openTasks} 个任务待完成`
      : '今日待打卡';

  const dueLabel = pinnedTask ? formatDueCountdown(pinnedTask.due_at) : null;
  const taskHref =
    pinnedTask?.ref && readerHrefFromRef(pinnedTask.ref, { group: gid, task: pinnedTask.id });

  return (
    <section className="group-today-action card card-tint card-2">
      <div className="group-today-action-head">
        <span className="group-composer-label">今日行动</span>
        <span className={`group-today-my-status${detail.my_checked_in_today ? ' done' : ''}`}>
          {myLabel}
        </span>
      </div>

      {pinnedTask && (
        <div className="group-today-pinned">
          <div className="group-today-pinned-row">
            <span className="group-today-pin-icon" aria-hidden>📌</span>
            <strong>{pinnedTask.title}</strong>
            {dueLabel && <span className="group-task-due-badge">{dueLabel}</span>}
          </div>
          <div className="group-pinned-actions">
            {taskHref && !pinnedTask.completed && (
              <Link
                href={`${taskHref}&taskTitle=${encodeURIComponent(pinnedTask.title)}`}
                className="font-pill"
              >
                去完成 ›
              </Link>
            )}
            {!pinnedTask.completed && onCompleteTask && (
              <button
                type="button"
                className="font-pill accent"
                onClick={() => onCompleteTask(pinnedTask.id, pinnedTask.title, pinnedTask.ref)}
              >
                完成并分享
              </button>
            )}
            {pinnedTask.completed && (
              <span className="muted" style={{ fontSize: 12 }}>已完成 ✓</span>
            )}
          </div>
        </div>
      )}

      <div className="group-today-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted group-today-progress-label">
          今日 {checked}/{members} 已打卡
          {detail.plan_id && detail.plan_progress_pct != null
            ? ` · 计划 ${detail.plan_progress_pct}%`
            : ''}
        </p>
      </div>

      {!detail.my_checked_in_today && (
        <div className="group-today-ctas">
          <button type="button" className="btn" disabled={busy} onClick={onQuickCheckin}>
            {busy ? '处理中…' : '一键打卡'}
          </button>
          <button type="button" className="font-pill accent" onClick={onOpenComposer}>
            写感想打卡
          </button>
        </div>
      )}
    </section>
  );
}
