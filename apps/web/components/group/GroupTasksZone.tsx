'use client';

import Link from 'next/link';
import type { GroupDetail, GroupTask } from '@/lib/api';
import { formatDueCountdown, groupMemberCount } from '@/lib/group_ui';
import { readerHrefFromRef } from '@/lib/group_footprint';

type Props = {
  detail: GroupDetail;
  gid: string;
  pinnedTask?: GroupTask | null;
  tasks: GroupTask[];
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
};

export function GroupTasksZone({
  detail,
  gid,
  pinnedTask,
  tasks,
  onCompleteTask,
}: Props) {
  const members = groupMemberCount(detail);
  const checked = detail.checked_in_today ?? 0;
  const openTasks = tasks.filter((t) => !t.completed);
  const pct = members > 0 ? Math.round((checked / members) * 100) : 0;

  if (!pinnedTask && openTasks.length === 0 && !detail.announcement) {
    return (
      <section className="group-wechat-tasks group-wechat-tasks-compact">
        <div className="group-wechat-tasks-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="muted">今日 {checked}/{members} 已打卡</span>
        </div>
      </section>
    );
  }

  return (
    <section className="group-wechat-tasks">
      <div className="group-wechat-tasks-head">
        <span className="group-wechat-zone-label">群任务</span>
        <span className="muted group-wechat-tasks-meta">
          今日 {checked}/{members} 已打卡
        </span>
      </div>

      {detail.announcement && (
        <div className="group-wechat-announce">
          <span className="group-wechat-announce-tag">公告</span>
          <p>{detail.announcement}</p>
        </div>
      )}

      {pinnedTask && (
        <TaskRow
          gid={gid}
          task={pinnedTask}
          pinned
          onCompleteTask={onCompleteTask}
        />
      )}

      {openTasks
        .filter((t) => t.id !== pinnedTask?.id)
        .map((t) => (
          <TaskRow key={t.id} gid={gid} task={t} onCompleteTask={onCompleteTask} />
        ))}
    </section>
  );
}

function TaskRow({
  gid,
  task,
  pinned,
  onCompleteTask,
}: {
  gid: string;
  task: GroupTask;
  pinned?: boolean;
  onCompleteTask?: (taskId: string, title: string, ref?: string | null) => void;
}) {
  const dueLabel = formatDueCountdown(task.due_at);
  const taskHref =
    task.ref && readerHrefFromRef(task.ref, { group: gid, task: task.id });

  return (
    <div className={`group-wechat-task-row${pinned ? ' pinned' : ''}`}>
      <div className="group-wechat-task-main">
        {pinned && <span className="group-wechat-task-pin" aria-hidden>📌</span>}
        <strong>{task.title}</strong>
        {dueLabel && <span className="group-task-due-badge">{dueLabel}</span>}
      </div>
      <div className="group-wechat-task-actions">
        {taskHref && !task.completed && (
          <Link
            href={`${taskHref}&taskTitle=${encodeURIComponent(task.title)}`}
            className="font-pill"
          >
            去读
          </Link>
        )}
        {!task.completed && onCompleteTask && (
          <button
            type="button"
            className="font-pill accent"
            onClick={() => onCompleteTask(task.id, task.title, task.ref)}
          >
            完成
          </button>
        )}
        {task.completed && <span className="muted" style={{ fontSize: 12 }}>已完成 ✓</span>}
      </div>
    </div>
  );
}
