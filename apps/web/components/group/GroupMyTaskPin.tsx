'use client';

import Link from 'next/link';
import type { GroupTask } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';
import { setReaderReturnHref } from '@/lib/reader_return';
import { formatDueCountdown } from '@/lib/group_ui';

type Props = {
  gid: string;
  task: GroupTask;
  onComplete?: (taskId: string, title: string, ref?: string | null) => void;
};

/** 输入区上方：我的未完成任务钉，完成即消。 */
export function GroupMyTaskPin({ gid, task, onComplete }: Props) {
  if (task.completed) return null;
  const href = task.ref ? readerHrefFromRef(task.ref, { group: gid, task: task.id }) : null;
  const due = formatDueCountdown(task.due_at);

  const beforeRead = () => {
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('focus', 'taskComplete');
    u.searchParams.set('taskId', task.id);
    setReaderReturnHref(`${u.pathname}${u.search}`);
  };

  return (
    <div className="group-my-task-pin" role="status">
      <div className="group-my-task-pin-main">
        <span className="group-my-task-pin-label">待完成</span>
        <strong className="group-my-task-pin-title">{task.title}</strong>
        {due ? <span className="muted group-my-task-pin-due">{due}</span> : null}
      </div>
      <div className="group-my-task-pin-actions">
        {href ? (
          <Link
            href={`${href}&taskTitle=${encodeURIComponent(task.title)}`}
            className="font-pill"
            onClick={beforeRead}
          >
            去读
          </Link>
        ) : null}
        {onComplete ? (
          <button
            type="button"
            className="font-pill accent"
            onClick={() => onComplete(task.id, task.title, task.ref)}
          >
            完成
          </button>
        ) : null}
      </div>
    </div>
  );
}
