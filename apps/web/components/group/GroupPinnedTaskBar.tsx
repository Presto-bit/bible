'use client';

import Link from 'next/link';
import type { GroupTask } from '@/lib/api';
import { readerHrefFromRef } from '@/lib/group_footprint';

type Props = {
  gid: string;
  task: GroupTask;
  onComplete?: (taskId: string, title: string, ref?: string | null) => void;
};

export function GroupPinnedTaskBar({ gid, task, onComplete }: Props) {
  const href = task.ref ? readerHrefFromRef(task.ref, { group: gid, task: task.id }) : null;

  return (
    <div className="group-pinned-task card card-tint card-2">
      <span className="group-composer-label">置顶任务</span>
      <strong style={{ display: 'block', marginTop: 4, fontSize: 14 }}>{task.title}</strong>
      <div className="group-pinned-actions">
        {href && (
          <Link
            href={`${href}&taskTitle=${encodeURIComponent(task.title)}`}
            className="font-pill"
          >
            去完成 ›
          </Link>
        )}
        {!task.completed && onComplete && (
          <button
            type="button"
            className="font-pill accent"
            onClick={() => onComplete(task.id, task.title, task.ref)}
          >
            完成并分享
          </button>
        )}
        {task.completed && <span className="muted" style={{ fontSize: 12 }}>已完成 ✓</span>}
      </div>
    </div>
  );
}
